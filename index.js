const mineflayer = require('mineflayer')
const fs = require('fs')
const cfg = JSON.parse(fs.readFileSync('./config.json','utf8'))

let bot = null
let yaw = 0
let movementInterval = null
let reconnectTimer = null

function appendLog(path, text){
  try{ fs.appendFileSync(path, text + '\n') }catch(e){}
}

function safeSetControl(name, value){
  try{
    if(bot && typeof bot.setControlState === 'function'){
      bot.setControlState(name, value)
    }
  }catch(e){
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] safeSetControl error: ${e.stack||e}`)
  }
}

function startMovement(){
  // start only after spawn, and avoid duplicate intervals
  if(movementInterval) return
  if(!bot) return
  safeSetControl('forward', true)
  safeSetControl('sprint', true)
  movementInterval = setInterval(()=>{
    try{
      yaw += cfg.moveYawStep || 0.12
      const pitch = 0
      if(bot && typeof bot.look === 'function'){
        bot.look(yaw, pitch, true).catch(()=>{})
      }
    }catch(e){
      appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] movement loop error: ${e.stack||e}`)
    }
  }, cfg.moveIntervalMs || 200)
  appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] movement started`)
}

function stopMovement(){
  if(movementInterval){
    clearInterval(movementInterval)
    movementInterval = null
    appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] movement stopped (interval cleared)`)
  }
  // try to release controls safely
  safeSetControl('forward', false)
  safeSetControl('sprint', false)
  safeSetControl('jump', false)
}

function authAndStart(){
  // register then login with safe checks
  setTimeout(()=>{
    try{
      if(bot && typeof bot.chat === 'function'){
        appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] sending /register`)
        bot.chat(`/register ${cfg.authmePassword} ${cfg.authmePassword}`)
      }
    }catch(e){ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] register error: ${e.stack||e}`) }
  }, cfg.registerDelay || 3000)

  setTimeout(()=>{
    try{
      if(bot && typeof bot.chat === 'function'){
        appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] sending /login`)
        bot.chat(`/login ${cfg.authmePassword}`)
      }
    }catch(e){ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] login error: ${e.stack||e}`) }
  }, (cfg.registerDelay || 3000) + (cfg.loginDelayAfterRegister || 5000))
}

function scheduleReconnect(){
  if(reconnectTimer) return
  const delay = cfg.reconnectDelay || 10000
  appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] scheduling reconnect in ${delay}ms`)
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null
    createBot()
  }, delay)
}

function cleanupBot(){
  try{
    stopMovement()
    if(bot){
      bot.removeAllListeners && bot.removeAllListeners()
    }
  }catch(e){ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] cleanup error: ${e.stack||e}`) }
}

function createBot(){
  appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] createBot attempt`)
  try{
    bot = mineflayer.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: cfg.version || false,
      connectTimeout: 30*1000
    })
  }catch(err){
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] createBot throw: ${err.stack||err}`)
    bot = null
    scheduleReconnect()
    return
  }

  bot.once('spawn', ()=>{
    appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] spawned`)
    authAndStart()
    startMovement()
  })

  bot.on('kicked', (reason)=>{
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] kicked: ${reason}`)
    try{ bot.end && bot.end() }catch(e){}
    cleanupBot()
    bot = null
    scheduleReconnect()
  })

  bot.on('end', ()=>{
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] connection ended`)
    cleanupBot()
    bot = null
    scheduleReconnect()
  })

  bot.on('error', (err)=>{
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] error event: ${err && (err.stack||err)}`)
    try{ bot.end && bot.end() }catch(e){}
    cleanupBot()
    bot = null
    scheduleReconnect()
  })

  bot.on('message', (jsonMsg, position, raw)=>{
    try{
      if(cfg.chatConsole) console.log(raw)
      appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] ${raw}`)
    }catch(e){}
  })

  // safety: if server respawns the player (death), resume movement after short delay
  bot.on('respawn', ()=>{
    setTimeout(()=>{ startMovement() }, 2000)
  })
}

// global promise rejection catcher
process.on('unhandledRejection', (reason, p) => {
  appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] unhandledRejection: ${reason && (reason.stack||reason)}`)
  // don't crash; try to recover
  try{
    if(bot && typeof bot.end === 'function') bot.end()
  }catch(e){}
  cleanupBot()
  bot = null
  scheduleReconnect()
})

process.on('uncaughtException', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] uncaughtException: ${err.stack||err}`) })

process.on('SIGINT', ()=>{ try{ cleanupBot(); bot && bot.end && bot.end(); process.exit(0) }catch(e){ process.exit(1) }})
process.on('SIGTERM', ()=>{ try{ cleanupBot(); bot && bot.end && bot.end(); process.exit(0) }catch(e){ process.exit(1) }})

createBot()

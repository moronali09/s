const mineflayer = require('mineflayer')
const fs = require('fs')
const cfg = JSON.parse(fs.readFileSync('./config.json','utf8'))

let bot = null
let yaw = 0
let moving = false
let movementInterval = null
let reconnectTimer = null

function appendLog(path, text){ fs.appendFile(path, text + '\n', ()=>{}) }

function startMovement(){
  if(!bot || movementInterval) return
  bot.setControlState('forward', true)
  bot.setControlState('sprint', true)
  movementInterval = setInterval(()=>{
    yaw += cfg.moveYawStep
    const pitch = 0
    bot.look(yaw, pitch, true).catch(()=>{})
  }, cfg.moveIntervalMs)
}

function stopMovement(){
  if(movementInterval){
    clearInterval(movementInterval)
    movementInterval = null
  }
  if(bot){
    bot.setControlState('forward', false)
    bot.setControlState('sprint', false)
  }
}

function authAndStart(){
  setTimeout(()=>{ 
    if(bot && bot.chat) bot.chat(`/register ${cfg.authmePassword} ${cfg.authmePassword}`)
  }, cfg.registerDelay)
  setTimeout(()=>{ 
    if(bot && bot.chat) bot.chat(`/login ${cfg.authmePassword}`)
  }, cfg.registerDelay + cfg.loginDelayAfterRegister)
}

function scheduleReconnect(){
  if(reconnectTimer) return
  appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] scheduling reconnect in ${cfg.reconnectDelay}ms`)
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null
    createBot()
  }, cfg.reconnectDelay)
}

function cleanupBotEvents(){
  try{
    bot.removeAllListeners && bot.removeAllListeners()
  }catch(e){}
}

function createBot(){
  appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] creating bot...`)
  try{
    bot = mineflayer.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: false,
      connectTimeout: 30 * 1000
    })
  }catch(err){
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] createBot error: ${err.stack||err}`)
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
    try{ stopMovement() }catch(e){}
    try{ bot.end && bot.end() }catch(e){}
    scheduleReconnect()
  })

  bot.on('end', ()=>{
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] connection ended`)
    stopMovement()
    cleanupBotEvents()
    bot = null
    scheduleReconnect()
  })

  bot.on('error', (err)=>{
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] error: ${err && (err.stack||err)}`)
    // If connection reset or similar, close socket and reconnect
    try{ bot.end && bot.end() }catch(e){}
    stopMovement()
    cleanupBotEvents()
    bot = null
    scheduleReconnect()
  })

  bot.on('message', (jsonMsg, position, raw)=>{
    if(cfg.chatConsole){ console.log(raw) }
    appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] ${raw}`)
  })

  // optional: if server kicks for spam, delay respawn a bit
  bot.on('respawn', ()=>{ setTimeout(()=>{ startMovement() }, 2000) })
}

process.on('uncaughtException', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] uncaughtException: ${err.stack||err}`) })
process.on('unhandledRejection', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] unhandledRejection: ${err && (err.stack||err)}`) })

// graceful shutdown for pm2 stop/restart
process.on('SIGINT', ()=>{ try{ stopMovement(); bot && bot.end && bot.end(); process.exit(0) }catch(e){ process.exit(1) }})
process.on('SIGTERM', ()=>{ try{ stopMovement(); bot && bot.end && bot.end(); process.exit(0) }catch(e){ process.exit(1) }})

createBot()

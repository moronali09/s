const mineflayer = require('mineflayer')
const fs = require('fs')
const { Vec3 } = require('vec3')
const cfg = JSON.parse(fs.readFileSync('./config.json','utf8'))
let bot = null
let yaw = 0
let moving = false
function appendLog(path, text){ fs.appendFile(path, text + '\n', ()=>{}) }
function startMovement(){
  if(moving) return
  moving = true
  bot.setControlState('forward', true)
  bot.setControlState('sprint', true)
  bot.setControlState('jump', false)
  setInterval(()=>{
    yaw += cfg.moveYawStep
    const pitch = 0
    bot.look(yaw, pitch, true).catch(()=>{})
  }, cfg.moveIntervalMs)
}
function stopMovement(){
  moving = false
  bot.setControlState('forward', false)
  bot.setControlState('sprint', false)
}
function authAndStart(){
  setTimeout(()=>{ bot.chat(`/register ${cfg.authmePassword} ${cfg.authmePassword}`) }, cfg.registerDelay)
  setTimeout(()=>{ bot.chat(`/login ${cfg.authmePassword}`) }, cfg.registerDelay + cfg.loginDelayAfterRegister)
}
function createBot(){
  try{
    bot = mineflayer.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: false
    })
  }catch(err){
    appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] createBot error: ${err.stack||err}`)
    scheduleReconnect()
    return
  }
  bot.once('spawn', ()=>{ authAndStart(); startMovement() })
  bot.on('kicked', (reason)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] kicked: ${reason}`) })
  bot.on('end', ()=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] connection ended`); stopMovement(); scheduleReconnect() })
  bot.on('error', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] error: ${err.stack||err}`) })
  bot.on('message', (jsonMsg, position, raw)=>{ if(cfg.chatConsole){ console.log(raw) } appendLog(cfg.logFiles.chat, `[${new Date().toISOString()}] ${raw}`) })
  bot.on('death', ()=>{ setTimeout(()=>{ try{ bot.emit('respawn') }catch(e){} }, 2000) })
}
let reconnectTimer = null
function scheduleReconnect(){
  if(reconnectTimer) return
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null
    createBot()
  }, cfg.reconnectDelay)
}
process.on('uncaughtException', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] uncaughtException: ${err.stack||err}`) })
process.on('unhandledRejection', (err)=>{ appendLog(cfg.logFiles.error, `[${new Date().toISOString()}] unhandledRejection: ${err&&err.stack||err}`) })
createBot()

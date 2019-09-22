import HttpRequest from "./HttpRequest";
// import * as WebSocket from 'ws';
import { EventEmitter } from 'events';

export const DiscordEvent = {
  Connected: 'connected',
  Message: 'message',
  Chat: 'chat',
}

const DiscordPacketsIncoming = {
	Message: 0,
	Hello: 10,
	HeartbeatAck: 11,
}

const DiscordPacketsOutgoing = {
	Heartbeat: 1,
	Identify: 2,
	Status: 3,
}

const DiscordMessages = {
	Create: 'MESSAGE_CREATE'
}

const ConnectionState = {
	Unknown0: 0,
	Unknown1: 1,
	Unknown2: 2,
	Unknown3: 3,
}

const DiscordApi = {
  Host: "discordapp.com",
  Base: "/api/v6",
  Channel: "channels",
  Message: "messages",
}

class UnknownMessage {
	constructor(json) {
		console.log('[M]',json);
	}
}

class DiscordMessage {
	constructor(json) {
		console.log(`(${json.author.username}) ${json.content}`);
	}
}

class AsyncEventEmitter extends EventEmitter {
  async emit(type, ...args) {
    const promises = [];
    const handler = this.listeners(type);
    for( let i =0; i < handler.length; i++) {
      promises.push(Reflect.apply(handler[i], this, args));
    }

    await Promise.all(promises);

    return true;
  }
}

class DiscordClient {
  ws: WebSocket;
  heartbeatInterval: number;
  connectionStartTime: number;
  seq: number = 0;
  connectionState: number = 0;
  token: string;
  emitter: EventEmitter = new EventEmitter;
  constructor(private token: string) {
  }
  disconnect() {
    this.ws.close();
  }
  async connect() {
    const self = this;
    const ws = new WebSocket('wss://gateway.discord.gg'); /*,null,{
      'origin': 'https://discordapp.com',
      'headers': {
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.85 Safari/537.36'
    }});*/
    try {
      ws.on('open', this.onOpen.bind(this));
      ws.on('message', this.incoming.bind(this));
    } catch(e) {
    }
    try {
      ws.onmessage = this.incoming.bind(this);
      ws.onopen = this.onOpen.bind(this);
    }
    catch(e) {
    }
    this.ws = ws;
  }
   async onOpen() {
     this.connectionStartTime = Date.now();
   }
   incoming(data) {
     const json = JSON.parse(event.data);
     if (json.s !== null) {
	     this.seq = json.s;
     }
     switch(json.op) {
       case DiscordPacketsIncoming.Message:
         this._handleMessage(json);
	 break;
       case DiscordPacketsIncoming.Hello:
         this._handleHello(json.d);
	 break;
       case DiscordPacketsIncoming.HeartbeatAck:
         if (this.connectionState != ConnectionState.Unknown3) { this._handleIdentify(json.d); }
         break;
       default:
         console.log(`[R] ${data}`);
         break;
     }
   }
   _handleIdentify(data) {
     this.connectionState = ConnectionState.Unknown3;
     this.send(DiscordPacketsOutgoing.Identify, { token: this.token, properties: { '$os': '4', '$browser': '4', '$device': '4' }, presence: {}, compress: this.usesCompression() }, false);	   
     this.emit(DiscordEvent.Connected);
   }
   _handleHello(data) {
     this.heartbeatInterval = data.heartbeat_interval;
     const ms = Date.now() - this.connectionStartTime;
     console.log(`[HELLO] via ${this.getConnectionPath(data)}, heartbeat interval: ${this.heartbeatInterval}, took ${ms}ms`);
     setInterval(this.sendHeartbeat.bind(this), this.heartbeatInterval);
     this.sendHeartbeat();
   }
   _handleMessage(json) {
     let message = null;
     switch(json.t) {
       case DiscordMessages.Create:
           this.emit(DiscordEvent.Chat, json.d); 
           break;
       default:
           this.emit(DiscordEvent.Message, json.d);
           break;
     }
     return message;
   }
   sendHeartbeat() {
     this.send(DiscordPacketsOutgoing.Heartbeat, this.seq++, false);
   }
   sendChatMessage(channel: string, message: string) {
     this.api({
       content: message
     }, DiscordApi.Base, DiscordApi.Channel, channel, DiscordApi.Message);
   }
   sendStatusUpdate(status: string) {
     this.send(DiscordPacketsOutgoing.Status, {
       since: null,
       game: {
         name: status,
	       type: 0,
       },
       status: "online",
       afk: false
     },
     false);
   }
   getConnectionPath(data) {
     return data._trace ? data._trace.join(" -> ") : "???";
   }
   usesCompression() {
     return false; // study zlib compression later
   }
   on(event, fun) {
     this.emitter.on(event, (...args) => {
       setImmediate(async () => {
         fun(...args);
       });
     });
   }
   emit(event, ...args) {
     this.emitter.emit(event, ...args);
   }
   api(payload, ...api) {
     const endpoint = api.join('/');
     console.log(endpoint);
     new HttpRequest().httpRequest({
       protocol: 'https',
       method: 'POST',
       host: DiscordApi.Host,
       path: endpoint,
       headers: {
         'Content-Type': 'application/json',
         authorization: this.token
       },
       body: JSON.stringify(payload),
     });
   }
   send(e, t, n) {
      const packet = {
	      op: e,
	      d: t
      };
      const str = JSON.stringify(packet);
      console.log(`[S] ${str}`);
      this.ws.send(str);
   }
  
}
export default DiscordClient;

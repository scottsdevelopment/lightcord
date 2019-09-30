import HttpRequest from "./HttpRequest";
import WebSocket from 'isomorphic-ws';

import {
  EventEmitter
} from 'events';

export enum DiscordEvent {
  Connected = 'connected',
  Message = 'message',
  Chat = 'chat',
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
  VoiceStateUpdate: 4,
}

const DiscordMessages = {
  Ready: 'READY',
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

export class UnknownMessage {
  constructor(json: any) {
    console.log('[M]', json);
  }
}

export class DiscordMessage {
  constructor(json: any) {
    console.log(`(${json.author.username}) ${json.content}`);
  }
}

class AsyncEventEmitter extends EventEmitter {
  emit(type: any, ...args: any[]): boolean {
    const promises = [];
    const handler = this.listeners(type);
    for (let i = 0; i < handler.length; i++) {
      promises.push(Reflect.apply(handler[i], this, args));
    }
    Promise.all(promises);
    return true;
  }
}

class DiscordClient {
  ws: WebSocket;
  heartbeatInterval: number;
  connectionStartTime: number;
  seq: number = 0;
  connectionState: number = 0;
  emitter: EventEmitter = new EventEmitter;
  constructor(private token: string) {}
  disconnect() {
    this.ws.close();
  }
  async connect() {
    const ws = new WebSocket('wss://gateway.discord.gg');

    ws.onmessage = this.incoming.bind(this);
    ws.onopen = this.onOpen.bind(this);
  
    this.ws = ws;
  }
  async onOpen() {
    this.connectionStartTime = Date.now();
  }
  incoming(event: Event) {
    const data = (event as any).data;
    const json = JSON.parse(data);
    if (json.s !== null) {
      this.seq = json.s;
    }
    switch (json.op) {
      case DiscordPacketsIncoming.Message:
        this._handleMessage(json);
        break;
      case DiscordPacketsIncoming.Hello:
        this._handleHello(json.d);
        break;
      case DiscordPacketsIncoming.HeartbeatAck:
        if (this.connectionState != ConnectionState.Unknown3) {
          this._handleIdentify();
        }
        break;
      default:
        console.log(`[R:${json.op}] ${data}`);
        break;
    }
  }
  _handleIdentify() {
    this.connectionState = ConnectionState.Unknown3;
    this.send(DiscordPacketsOutgoing.Identify, {
      token: this.token,
      properties: {
        '$os': '4',
        '$browser': '4',
        '$device': '4'
      },
      presence: {},
      compress: this.usesCompression()
    });
  }
  _handleHello(data: any) {
    this.heartbeatInterval = data.heartbeat_interval;
    const ms = Date.now() - this.connectionStartTime;
    console.log(`[HELLO] via ${this.getConnectionPath(data)}, heartbeat interval: ${this.heartbeatInterval}, took ${ms}ms`);
    setInterval(this.sendHeartbeat.bind(this), this.heartbeatInterval);
    this.sendHeartbeat();
  }
  _handleMessage(json: {t: any, d: any}) {
    let message = null;
    switch (json.t) {
      case DiscordMessages.Ready:
        this.emit(DiscordEvent.Connected);
        break;
      case DiscordMessages.Create:
        this.emit(DiscordEvent.Chat, json.d);
        break;
      default:
        this.emit(DiscordEvent.Message, json);
        break;
    }
    return message;
  }
  sendHeartbeat() {
    this.send(DiscordPacketsOutgoing.Heartbeat, this.seq++);
  }
  sendChatMessage(channel: string, message: string) {
    this.api({
      content: message
    }, DiscordApi.Base, DiscordApi.Channel, channel, DiscordApi.Message);
  }
  sendVoiceStateUpdate(guildId: string, channelId: string, selfMute: boolean, selfDeaf: boolean, selfVideo: boolean) {
    this.send(DiscordPacketsOutgoing.VoiceStateUpdate, {
      guild_id: guildId,
      channel_id: channelId,
      self_mute: selfMute,
      self_deaf: selfDeaf,
      self_video: selfVideo
    });
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
      });
  }
  getConnectionPath(data: any) {
    return data._trace ? data._trace.join(" -> ") : "???";
  }
  usesCompression() {
    return false; // study zlib compression later
  }
  on(event: DiscordEvent, fun: Function) {
    this.emitter.on(event, (...args: any[]) => {
      setImmediate(async () => {
        fun(...args);
      });
    });
  }
  emit(event: string, ...args: any[]) {
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
  send(opCode: number, data: object|number) {
    const packet = {
      op: opCode,
      d: data
    };
    const str = JSON.stringify(packet);
    console.log(`[S] ${str}`);
    this.ws.send(str);
  }

}
export default DiscordClient;
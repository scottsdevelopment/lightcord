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

const DiscordVoicePacketsOutgoing = {
  Identify: 0
}

const DiscordPacketsOutgoing = {
  Heartbeat: 1,
  Identify: 2,
  Status: 3,
  VoiceStateUpdate: 4,
}

export enum DiscordMessage {
  Ready = 'READY',
  Create = 'MESSAGE_CREATE',
  VoiceStateUpdate = 'VOICE_STATE_UPDATE',
  VoiceServerUpdate = 'VOICE_SERVER_UPDATE'
}

const ConnectionState = {
  Disconnected: 0,
  Unknown1: 1,
  Unknown2: 2,
  Connected: 3,
}

const DiscordApi = {
  Host: 'discordapp.com',
  Base: '/api/v8',
  Me: '@me',
  Users: 'users',
  Channel: 'channels',
  Message: 'messages',
  Invites: 'invites'
}

export class UnknownMessage {
  constructor(json: any) {
    console.log('[M]', json);
  }
}

export class DiscordMessageHandler {
  constructor(json: any) {
    console.log(`(${json.d.author.username}) ${json.d.content}`);
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

class DiscordVoiceConnection {

}

class DiscordClient {
  voiceEndpoint: string;
  voiceWs: WebSocket;
  voiceSessionId: string;
  voiceToken: string;
  voiceServerId: string;
  ws: WebSocket;
  heartbeatInterval: number;
  connectionStartTime: number;
  seq: number = 0;
  connectionState: number = 0;
  emitter: AsyncEventEmitter = new AsyncEventEmitter;
  heartbeatTimer: NodeJS.Timeout;
  user: any; // struct out
  constructor(private token: string) {}
  disconnect() {
    clearInterval(this.heartbeatInterval);
    this.ws.close();
    this.connect();
  }
  async connect() {
    try {
      this.seq = 0
      this.connectionState = 0;
      const ws = new WebSocket('wss://gateway.discord.gg');
      ws.onmessage = this.incoming.bind(this);
      ws.onopen = this.onOpen.bind(this);
      ws.onclose = this.onClose.bind(this);
      this.ws = ws;
    } catch(e) {
      console.log(e);
    }
  }
  async onOpen() {
    this.connectionStartTime = Date.now();
  }
  async onClose() {
    this.connectionStartTime = 0;
    this.connectionState = 0;
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
        this._handleHello(json);
        break;
      case DiscordPacketsIncoming.HeartbeatAck:
        if (this.connectionState !== ConnectionState.Connected) {
          this._handleIdentify();
        }
        break;
      default:
        console.log(`[R:${json.op}] ${data}`);
        break;
    }
  }
  async _handleIdentify() {
    await this.send(DiscordPacketsOutgoing.Identify, {
      token: this.token,
      properties: {
        '$os': '4',
        '$browser': '4',
        '$device': '4'
      },
      presence: {},
      compress: this.usesCompression()
    });

    this.connectionState = ConnectionState.Connected;
  }
  _handleHello(json: any) {
    this.heartbeatInterval = json.d.heartbeat_interval;
    const ms = Date.now() - this.connectionStartTime;
    console.log(`[HELLO] via ${this.getConnectionPath(json.d)}, heartbeat interval: ${this.heartbeatInterval}, took ${ms}ms`);
    this.heartbeatTimer = setInterval(this.sendHeartbeat.bind(this), this.heartbeatInterval);
    this.connectionState = ConnectionState.Unknown1;
    this.sendHeartbeat();
  }
  _handleVoiceStateUpdate(json: any) {
    //console.log(this.user);
    if (json.d.user_id == this.user.id) {
      // console.log(json);
      this.voiceSessionId = json.d.session_id;
      this.voiceServerId = json.d.guild_id;
    }
  }
  _handleVoiceConnect(json: any) {
    // console.log("DO MORE VOICE CONNECTION", json);
    this.voiceEndpoint = json.d.endpoint.match(/([^:]*)/);
    if (this.voiceEndpoint !== null) {
      this.voiceEndpoint = this.voiceEndpoint[0]
    }
    this.voiceToken = json.d.token;
    this.voiceWs = new WebSocket(`wss://${this.voiceEndpoint}`);
    this.voiceWs.onmessage = (event: WebSocket.MessageEvent) => {
      const data = (event as any).data;
      // console.log(data);
      const json = JSON.parse(data);
      switch(json.op) {
        case 8:
            this.voiceSend(DiscordVoicePacketsOutgoing.Identify, {
              server_id: this.voiceServerId,
              user_id: this.user.id,
              session_id: this.voiceSessionId,
              token: this.voiceToken
            });
        break;
      }
    }

    console.log(this.voiceEndpoint, this.voiceToken, this.voiceSessionId);
  }
  _handleMessage(json: any) {
    let message = null;
    switch (json.t) {
      case DiscordMessage.Ready:
        this.user = json.d.user;
        this.emit(DiscordEvent.Connected, json);
        break;
      case DiscordMessage.Create:
        this.emit(DiscordEvent.Chat, json);
        break;
      case DiscordMessage.VoiceStateUpdate:
        this._handleVoiceStateUpdate(json);
        this.emit(DiscordMessage.VoiceStateUpdate, json);
        break;
      case DiscordMessage.VoiceServerUpdate:
        this._handleVoiceConnect(json);
        this.emit(DiscordMessage.VoiceServerUpdate, json);
        break;
      default:
        this.emit(DiscordEvent.Message, json);
        break;
    }
    return message;
  }
  acceptInvite(inviteCode: string) {
    this.api({}, 'POST', DiscordApi.Base, DiscordApi.Invites, inviteCode);
  }
  sendHeartbeat() {
    if (this.connectionState > ConnectionState.Disconnected) {
      this.send(DiscordPacketsOutgoing.Heartbeat, this.seq++);
    }
    else if(this.connectionState === ConnectionState.Disconnected) {
      this.disconnect();
    }
  }
  sendChatMessage(channel: string, message: string) {
    this.api({
      content: message
    }, 'POST', DiscordApi.Base, DiscordApi.Channel, channel, DiscordApi.Message);
  }
  async sendPrivateMessage(user: string, message: string) {
    const results = await this.api({
      recipients: [user]
    }, 'POST', DiscordApi.Base, DiscordApi.Users, DiscordApi.Me, DiscordApi.Channel) as any;
    const data = JSON.parse(results.data);
    this.api({
      content: message
    }, 'POST', DiscordApi.Base, DiscordApi.Channel, data.id, DiscordApi.Message);
  }
  connectToVoice(guildId: string, channelId: string, selfMute: boolean, selfDeaf: boolean, selfVideo: boolean) {
    // this.sendVoiceStateUpdate
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
  // @TODO: Use an activity object interface
  sendStatusUpdate(gameName: string, gameId?: string, applicationId?: string) {
    this.send(DiscordPacketsOutgoing.Status, {
      since: null,
      game: {
        name: gameName,
        id: gameId,
        type: 0,
        application_id: applicationId
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
  on(event: DiscordEvent|DiscordMessage, fun: Function) {
    this.emitter.on(event, (...args: any[]) => {
      setImmediate(async () => {
        fun(...args);
      });
    });
  }
  emit(event: string, ...args: any[]) {
    this.emitter.emit(event, ...args);
  }
  api(payload: any, method='POST', ...api: string[]) {
    const endpoint = api.join('/');
    try {
      return new HttpRequest().httpRequest({
        protocol: 'https',
        method: method,
        host: DiscordApi.Host,
        path: endpoint,
        headers: {
          'Content-Type': 'application/json',
          authorization: this.token
        },
        body: payload,
      });
    } catch(e) {
      console.log ("ERROR CAUGHT", e);
    }
  }
  send(opCode: number, data: object|number) {
    const packet = {
      op: opCode,
      d: data
    };
    const str = JSON.stringify(packet);
    // console.log(`[S] ${str}`);
    this.ws.send(str);
  }
  voiceSend(opCode: number, data: object|number) {
    const packet = {
      op: opCode,
      d: data
    };
    const str = JSON.stringify(packet);
    // console.log(`[S] ${str}`);
    this.voiceWs.send(str);
  }

}
export default DiscordClient;
import HttpRequest from "./HttpRequest";
import * as WebSocket from 'ws';

/* s IrcCommand {
  constructor(public response: async Function, public type: string, public ...args: string[]) {
     this.response(...args);
  }
}
*/
const TwitchCommands = {
  Ping: 'PING',
  Pong: 'PONG',
  RoomState: 'ROOMSTATE',
  '353': '353',
  '001': '001',
  Connect: '376',
  PrivateMessage: 'PRIVMSG',
  Join: 'JOIN',
  Part: 'PART',
}

class TwitchClient {
  ws: WebSocket;
  channel: string;
  constructor(channel: string) {
    this.channel = channel;
    // this.handler = new TwitchClientCommandHandler(this);
    //	  this.handler.registerCommand(TwitchCommands.Ping, TwitchResponse.Pong);
  }
  processData(...data: string[]) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].trim() === '') {
        continue;
      }
      let struct = {
        raw: null,
        name: '',
        user: '',
        host: '',
        group: '',
        command: '',
        args: [],
        atExt: null,
        message: ''
      };
      //    console.log(data[i]);
      let match = /^(@(?<atdata>[^\s]+)\s)?(:((?<group>[^\s,^@,^!]+)!?(?<name>[^\s,^@]+)?@?(?<host>[^\s]+)?(\s((?<command>[^:,.]+\s?)(\:(?<message>.+))?))))?/.exec(data[i]);
      if (match) {
        struct = {
          raw: match,
          host: match.groups.host === undefined ? match.groups.group : match.groups.host,
          name: match.groups.name,
          user: match.groups.user,
          group: match.groups.group,
          command: '',
          args: [],
          atExt: {},
          message: match.groups.message === undefined ? '' : match.groups.message,
        }

        if (match.groups.command) {
          let args = match.groups.command.split(' ');
          struct.command = args[0];
          struct.args = args;
        }

        if (match.groups.atdata) {
          let config = {};
          match.groups.atdata.split(';').forEach((kvp) => {
            let obj = kvp.split('=');
            let name = obj[0];
            let value = obj[1];
            // console.log(name,value);
            config[name] = value;
          });
          struct.atExt = config;
        }
        //	   console.log(struct); 
        this.handleCommand(struct.command, struct);
      } else {
        struct.raw = data[i];
        console.log(struct);
        throw new Error('regex failed to match packet');
        //	    this.handleCommand(struct.command, struct);
      }
    }
  }

  handleCommand(command: string, struct: any) {
    switch (command) {
      case TwitchCommands.Ping:
        this.pong(struct);
        break;
      case TwitchCommands.Join:
        this.onJoin(struct);
        break;
      case TwitchCommands.Part:
        this.onPart(struct);
      case TwitchCommands.Connect:
        this.onConnect();
        break;
      case TwitchCommands.PrivateMessage:
        this.onPrivateMessage(struct);
        break;
      default:
        console.log(struct.message);

    }
  }

  onPrivateMessage(struct) {
    let userName = struct.atExt['display-name'] ? struct.atExt['display-name'] : struct.name;
    console.log(`(${userName}): ${struct.message}`);
  }
  onPart(struct) {
    const channel = struct.args[1];
    console.log(`${struct.name} has left ${channel}.`);
  }
  onJoin(struct) {
    const channel = struct.args[1];
    console.log(`${struct.name} has joined ${channel}.`);
  }
  onConnect() {
    this.join(`#${this.channel.toLowerCase()}`);
  }

  async connect() {
    let request = new HttpRequest('www.twitch.tv', `/${this.channel}`, 'GET');
    const pubsub = new WebSocket('wss://pubsub-edge.twitch.tv/v1');
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv', 'irc', {
      'origin': 'https://m.twitch.tv',
      'headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.85 Safari/537.36'
      }
    });
    pubsub.on('open', function open() {
      pubsub.send('{"type":"PING"}');
    });
    pubsub.on('message', function message(data) {
      console.log(data);
    });

    ws.on('open', function open() {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      ws.send('PASS SCHMOOPIIE');
      const rand = Math.floor(8e4 * Math.random() + 1e3);

      ws.send(`NICK justinfan${rand}`);
      ws.send(`USER justinfan${rand} 8 * :justinfan${rand}`);
    });
    ws.on('message', this.incoming.bind(this));
    this.ws = ws;
    return await request.perform();
  }
  incoming(data) {
    this.processData(...data.split('\r\n'));
  }
  ping() {

  }
  join(channel) {
    this.ws.send(`JOIN ${channel}`);
  }
  pong(struct) {
    console.log('Ping! Pong!');
    this.ws.send(`PONG ${struct.message}`);
  }
}
/*
class TwitchClientCommandHandler {
   constructor(private: client) {
	   
   }
   
   registerCommand(command: <T>, response: Function) {
	   let type = new command;
	   this.commands[command] = response;
   }

}

class TwitchResponse {
	constructor() {
		super();
	}
	Pong {
           this.client.ping();
	}
}*/

// const Rfc2818Matcher = ///
//	^ 


(async () => {
  let twitch = new TwitchClient(process.env.CHANNEL);

  let $ = await twitch.connect();

  //  console.log($.html());
})();
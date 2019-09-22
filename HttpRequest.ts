import * as https from "https";
import * as http from "http";
import * as util from "util";
import { StringDecoder} from "string_decoder";
import * as querystring from "querystring";
import * as cheerio from "cheerio";


export default class HttpRequest {

  $: cheerio;

  constructor(public host?: string, public path?: string, public method?: string, public body?: object) {
  }

  async perform() {
   try {
     const result: any = await this.httpRequest({ host: this.host, path: this.path, method: this.method, body: this.body  });
     const $ = cheerio.load(result.data);
     this.$ = $;
     return $;
   } catch(exception) {
     return exception;
   }
  }

  async httpRequest(options: any) {
    if(!options)      return new Promise((_, reject)=>{ reject( new Error('Missing \'options\' arg.'))})
    if(!options.host) return new Promise((_, reject)=>{ reject( new Error('\'host\' parameter is empty.'))})

    const protocol = (options.protocol || 'https').toLowerCase();
    const method   = (options.method || 'GET').toUpperCase();
    const path     = options.path || '/';
    const port     = options.port || (protocol === 'https' ? 443 : 80);


    const _http = protocol === 'https'? https : http;

    const prom = new Promise((resolve, reject) => {
      const ops = {
        hostname : options.host, // here only the domain name
        port : port,                                     
        path : (/^(\/)/i.test(path) ? '' : '/' ) + path,
        headers: options.headers || {},                 
        method : method
      };
      ops.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.85 Safari/537.36';
      let body = options.body;
      if(body && typeof(body) === 'object') {
        body = querystring.stringify(body);        
        //console.log(body);
        //if(!utils.hasHeader(ops, 'Content-Type'))
        //ops.headers['Content-Type'] = 'application/x-www-form-urlencoded'; // 'application/json; charset=utf-8';
        //if(!utils.hasHeader(ops, 'Content-Length'))
        ops.headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
      }

      const req = _http.request(ops, (res)=>{
        var decoder = new StringDecoder('utf-8');
        var buffer = '';                         
        res.on('data', function(data) {
          buffer += decoder.write(data);
        });                               
        res.on('end', function() {
          buffer += decoder.end();

          if(/^(2)/i.test(res.statusCode.toString()))  {
            resolve({statusCode : res.statusCode , data : buffer })
          } else {                                                                                                                                                                                                                                                                                                             
            reject({statusCode : res.statusCode , error : buffer })
          }
        });
        });
        
        req.on('error', (err)=>{
          reject({statusCode : 0, error : err});
        })

        req.on('timeout', (err)=>{
          reject({statusCode : 0, error : new Error('Timeout exeded.')});
        })

        if(body) {  req.write(Buffer.from(body).toString('utf8')) };
        req.end();
   });
    return prom;
  }
}


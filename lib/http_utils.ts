import * as request from 'request';
import {OptionsWithUrl} from 'request';
import * as url from 'url';

import {Logger} from './cli/logger';
import {Config} from './config';

let logger = new Logger('http_utils');

export declare interface RequestOptionsValue {
  proxy?: string;
  ignoreSSL?: boolean;
}

export class HttpUtils {
  static requestOpts: RequestOptionsValue = {};
  static assignOptions(options: RequestOptionsValue): void {
    Object.assign(HttpUtils.requestOpts, options);
  }

  static initOptions(url: string, timeout?: number): OptionsWithUrl {
    let options: OptionsWithUrl = {
      url: url,
      // default Linux can be anywhere from 20-120 seconds
      // increasing this arbitrarily to 4 minutes
      timeout: 240000
    };
    HttpUtils.optionsSSL(options, HttpUtils.requestOpts.ignoreSSL);
    HttpUtils.optionsProxy(options, url, HttpUtils.requestOpts.proxy);
    return options;
  }

  static optionsSSL(options: OptionsWithUrl, opt_ignoreSSL: boolean): OptionsWithUrl {
    if (opt_ignoreSSL) {
      logger.info('ignoring SSL certificate');
      options.strictSSL = !opt_ignoreSSL;
      (options as any).rejectUnauthorized = !opt_ignoreSSL;
    }

    return options;
  }

  static optionsProxy(options: OptionsWithUrl, requestUrl: string, opt_proxy: string):
      OptionsWithUrl {
    if (opt_proxy) {
      options.proxy = HttpUtils.resolveProxy(requestUrl, opt_proxy);
      if (url.parse(requestUrl).protocol === 'https:') {
        options.url = requestUrl.replace('https:', 'http:');
      }
    }
    return options;
  }

  static optionsHeader(options: OptionsWithUrl, key: string, value: string): OptionsWithUrl {
    if (options.headers == null) {
      options.headers = {};
    }
    options.headers[key] = value;
    return options;
  }

  /**
   * Resolves proxy based on values set
   * @param fileUrl The url to download the file.
   * @param opt_proxy The proxy to connect to to download files.
   * @return Either undefined or the proxy.
   */
  static resolveProxy(fileUrl: string, opt_proxy?: string): string {
    let protocol = url.parse(fileUrl).protocol;
    let hostname = url.parse(fileUrl).hostname;

    if (opt_proxy) {
      return opt_proxy;
    } else {
      // If the NO_PROXY environment variable exists and matches the host name,
      // to ignore the resolve proxy.
      // the checks to see if it exists and equal to empty string is to help with testing
      let noProxy: string = Config.noProxy();
      if (noProxy) {
        // array of hostnames/domain names listed in the NO_PROXY environment variable
        let noProxyTokens = noProxy.split(',');
        // check if the fileUrl hostname part does not end with one of the
        // NO_PROXY environment variable's hostnames/domain names
        for (let noProxyToken of noProxyTokens) {
          if (hostname.indexOf(noProxyToken) !== -1) {
            return undefined;
          }
        }
      }

      // If the HTTPS_PROXY and HTTP_PROXY environment variable is set, use that as the proxy
      if (protocol === 'https:') {
        return Config.httpsProxy() || Config.httpProxy();
      } else if (protocol === 'http:') {
        return Config.httpProxy();
      }
    }
    return undefined;
  }
}

/**
 * Request the body from the url.
 * @param requestUrl The request url.
 * @returns A promise string of the response body.
 */
export function requestBody(requestUrl: string): Promise<string> {
  const options = HttpUtils.initOptions(requestUrl);
  options.followRedirect = true;
  return new Promise((resolve, reject) => {
    const req = request(options);
    req.on('response', response => {
      if (response.statusCode === 200) {
        let output = '';
        response.on('data', (data) => {
          output += data;
        });
        response.on('end', () => {
          resolve(output);
        });
      } else {
        reject(new Error('response status code is not 200'));
      }
    });
    req.on('error', error => {
      reject(error);
    });
  });
}

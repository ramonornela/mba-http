import {
  ConnectionBackend,
  Connection,
  Request,
  Response,
  ReadyState,
  RequestMethod,
  BrowserXhr,
  ResponseType,
  ResponseOptions,
  XSRFStrategy,
  Headers,
  ResponseContentType
} from '@angular/http';
import { ContentType } from '@angular/http/src/enums';
import { isSuccess, getResponseURL } from '@angular/http/src/http_utils';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Observer } from 'rxjs/Observer';
import { Events } from './events';

export function xhrBackendFactory(
  browserXhr: BrowserXhr,
  responseOptions: ResponseOptions,
  xsrf: XSRFStrategy,
  events: Events) {
  return new XHRBackend(browserXhr, responseOptions, xsrf, events);
}

export class HttpEvents {

  static PRE_REQUEST: string = 'http.prerequest';
  static POST_REQUEST: string = 'http.postrequest';
  static POST_REQUEST_SUCCESS: string = 'http.postrequest_success';
  static POST_REQUEST_ERROR: string = 'http.postrequest_error';
}

const XSSI_PREFIX = /^\)\]\}',?\n/;

export class XHRConnection implements Connection {

  request: Request;

  /**
   * Response {@link EventEmitter} which emits a single {@link Response} value on load event of
   * `XMLHttpRequest`.
   */
  response: Observable<Response>;
  readyState: ReadyState;
  constructor(req: Request, browserXHR: BrowserXhr, baseResponseOptions?: ResponseOptions, private events?: Events) {
    this.request = req;
    this.response = new Observable<Response>((responseObserver: Observer<Response>) => {

      // disparando eventos pre request
      this.events.publish(HttpEvents.PRE_REQUEST, req);

      if (this.events.isStop()) {
        responseObserver.error({stop: HttpEvents.PRE_REQUEST});
      }

      let _xhr: XMLHttpRequest = browserXHR.build();
      _xhr.open(RequestMethod[req.method].toUpperCase(), req.url);
      if (req.withCredentials !== undefined && req.withCredentials !== null) {
        _xhr.withCredentials = req.withCredentials;
      }
      // load event handler
      let onLoad = () => {
        // responseText is the old-school way of retrieving response (supported by IE8 & 9)
        // response/responseType properties were introduced in ResourceLoader Level2 spec (supported
        // by IE10)
        let body = _xhr.response === undefined ? _xhr.responseText : _xhr.response;
        // Implicitly strip a potential XSSI prefix.
        if (typeof body === 'string') body = body.replace(XSSI_PREFIX, '');
        let headers = Headers.fromResponseHeaderString(_xhr.getAllResponseHeaders());

        let url = getResponseURL(_xhr);

        // normalize IE9 bug (http://bugs.jquery.com/ticket/1450)
        let status: number = _xhr.status === 1223 ? 204 : _xhr.status;

        // fix status code when it is 0 (0 status is undocumented).
        // Occurs when accessing file resources or on Android 4.1 stock browser
        // while retrieving files from application cache.
        if (status === 0) {
          status = body ? 200 : 0;
        }

        let statusText = _xhr.statusText || 'OK';

        var responseOptions = new ResponseOptions({body, status, headers, statusText, url});
        if (baseResponseOptions !== undefined && baseResponseOptions !== null) {
          responseOptions = baseResponseOptions.merge(responseOptions);
        }
        let response = new Response(responseOptions);
        response.ok = isSuccess(status);
        if (response.ok) {
          this.events.publish(HttpEvents.POST_REQUEST, response);

          if (this.events.isStop()) {
            responseObserver.error({stop: HttpEvents.POST_REQUEST});
          }

          this.events.publish(HttpEvents.POST_REQUEST_SUCCESS, response);

          if (this.events.isStop()) {
            responseObserver.error({stop: HttpEvents.POST_REQUEST_SUCCESS});
          }

          responseObserver.next(response);
          // TODO(gdi2290): defer complete if array buffer until done
          responseObserver.complete();
          return;
        }

        responseObserver.error(response);

        // disparando eventos post request e post request error
        this.events.publish(HttpEvents.POST_REQUEST, response);

        if (this.events.isStop()) {
          responseObserver.error({stop: HttpEvents.POST_REQUEST});
        }

        this.events.publish(HttpEvents.POST_REQUEST_ERROR, response);
      };
      // error event handler
      let onError = (err: any) => {
        var responseOptions = new ResponseOptions({
          body: err,
          type: ResponseType.Error,
          status: _xhr.status,
          statusText: _xhr.statusText,
        });
        if (baseResponseOptions !== undefined && baseResponseOptions !== null) {
          responseOptions = baseResponseOptions.merge(responseOptions);
        }

        let response = new Response(responseOptions);
        responseObserver.error(response);

        this.events.publish(HttpEvents.POST_REQUEST, response);

        if (this.events.isStop()) {
          responseObserver.error({stop: HttpEvents.POST_REQUEST});
        }

        this.events.publish(HttpEvents.POST_REQUEST_ERROR, response);
      };

      this.setDetectedContentType(req, _xhr);

      if (req.headers !== undefined && req.headers !== null) {
        req.headers.forEach((values, name) => _xhr.setRequestHeader(name, values.join(',')));
      }

      // Select the correct buffer type to store the response
      if ((req.responseType !== undefined && req.responseType !== null)
         && (_xhr.responseType !== undefined && _xhr.responseType !== null)) {
        switch (req.responseType) {
          case ResponseContentType.ArrayBuffer:
            _xhr.responseType = 'arraybuffer';
            break;
          case ResponseContentType.Json:
            _xhr.responseType = 'json';
            break;
          case ResponseContentType.Text:
            _xhr.responseType = 'text';
            break;
          case ResponseContentType.Blob:
            _xhr.responseType = 'blob';
            break;
          default:
            throw new Error('The selected responseType is not supported');
        }
      }

      _xhr.addEventListener('load', onLoad);
      _xhr.addEventListener('error', onError);

      _xhr.send(this.request.getBody());

      return () => {
        _xhr.removeEventListener('load', onLoad);
        _xhr.removeEventListener('error', onError);
        _xhr.abort();
      };
    });
  }

  setDetectedContentType(req: any /** TODO #9100 */, _xhr: any /** TODO #9100 */) {
    // Skip if a custom Content-Type header is provided
    if ((req.headers !== undefined && req.headers !== null)
       && (req.headers.get('Content-Type') !== undefined && req.headers.get('Content-Type') !== null)) {
      return;
    }

    // Set the detected content type
    switch (req.contentType) {
      case ContentType.NONE:
        break;
      case ContentType.JSON:
        _xhr.setRequestHeader('content-type', 'application/json');
        break;
      case ContentType.FORM:
        _xhr.setRequestHeader('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
        break;
      case ContentType.TEXT:
        _xhr.setRequestHeader('content-type', 'text/plain');
        break;
      case ContentType.BLOB:
        var blob = req.blob();
        if (blob.type) {
          _xhr.setRequestHeader('content-type', blob.type);
        }
        break;
    }
  }
}

@Injectable()
export class XHRBackend implements ConnectionBackend {
  constructor(
      private browserXHR: BrowserXhr,
      private baseResponseOptions: ResponseOptions,
      private xsrfStrategy: XSRFStrategy,
      private events: Events) {}

  createConnection(request: Request): XHRConnection {
    this.xsrfStrategy.configureRequest(request);
    return new XHRConnection(request, this.browserXHR, this.baseResponseOptions, this.events);
  }
}

export { Events };
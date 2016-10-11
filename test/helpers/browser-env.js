import { DOMParser } from 'xmldom'
import { jsdom } from 'jsdom'
import { File } from 'file-api'


global.document = jsdom('<body></body>')
global.DOMParser = DOMParser

File.prototype.slice = function (start = 0, end = null, contentType = '') {
  if (!end) {
    end = this.size
  }
  return new File({
    size: end - start,
    path: this.path,
    name: this.name,
    type: this.type || contentType
  })
}

global.File = File
global.Blob = File

let FileReaderMock = function () {}
FileReaderMock.prototype.onloadend = function () {}
FileReaderMock.prototype.readAsArrayBuffer = function () { this.onloadend(); }

global.FileReader = FileReaderMock;

function LocalStorage() {
  this.cache = {};
  this.getItem = function (key) {
    return this.cache[key];
  };
  this.setItem = function (key, value) {
    return this.cache[key] = value;
  };
  this.removeItem = function (key) {
    delete this.cache[key];
  };
}

global.localStorage = new LocalStorage();

global.defer = function () {
  var deferred, promise;
  promise = new Promise(function(resolve, reject){
    deferred = {resolve: resolve, reject: reject};
  });

  return {
    resolve: deferred.resolve,
    reject: deferred.reject,
    promise: promise
  }
}

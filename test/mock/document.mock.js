"use strict";

const urlParse = require('url-parse');


class Element {
  set href(url) {
    const parsedUrl = urlParse(url);

    this.protocol = parsedUrl.protocol;
    this.hostname = parsedUrl.hostname;
    this.pathname = parsedUrl.pathname;
    this.port = parsedUrl.port;
    this.search = 'TODO';
    this.hash = parsedUrl.hash;
    this.host = parsedUrl.host
  }
}

class Document {
  createElement() {
    return new Element()
  }
}

module.exports = new Document();

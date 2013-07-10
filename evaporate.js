/*Copyright (c) 2013, TT Labs, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

   Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

   Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

   Neither the name of the TT Labs, Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/


/***************************************************************************************************
*                                                                                                  *
*  version 0.0.1                                                                                   *
*                                                                                                  *
*  TODO:                                                                                           *
*       calculate MD5s and send with PUTs                                                          *
*       post eTags to application server to allow resumabilit after client-side crash/restart      *
*                                                                                                  *
*                                                                                                  *
***************************************************************************************************/


var Evaporate = function(config){

   this.supported = !((typeof(File)=='undefined') ||
      (typeof(Blob)=='undefined') ||
      !(!!Blob.prototype.webkitSlice || !!Blob.prototype.mozSlice || Blob.prototype.slice) ||
      config.testUnsupported);

   if(!this.supported){
      return;
   }


   var PENDING = 0, EVAPORATING = 2, COMPLETE = 3, PAUSED = 4; REMOVED = 5, ERROR = 10, ABORTED = 20, AWS_URL = 'https://s3.amazonaws.com', ETAG_OF_0_LENGTH_BLOB = '"d41d8cd98f00b204e9800998ecf8427e"';

   var _ = this;
   var files = [];

   var con = extend({

      logging: true,
      maxConcurrentParts: 5,
      partSize: 6 * 1024 * 1024,
      retryBackoffPower: 2,
      maxRetryBackoffSecs: 20,
      progressIntervalMS: 1000

   }, config);



   _.add = function(file){

      l.d('add');
      var err;
      if (typeof file == 'undefined'){
         return 'Missing file';
      }
      if (typeof file.name == 'undefined'){
         err = 'Missing attribute: name  ';
      }
      /*if (!(file.file instanceof File)){
         err += '.file attribute must be instanceof File';
      }*/
      if (err){return err;}

      var newId = addFile(file);
      asynProcessQueue();
      return newId;
   };

   _.remove = function(id){

      l.d('remove');
   };

   _.pause = function(id){


   };

   _.resume = function(id){


   };

   _.forceRetry = function(){


   };

   var l = {d:function(){}, w: function(){}, e:function(){}};

   if(con.logging && console && console.log){
      l = console;
      l.d = l.log;

      if (console.warn){
         l.w = l.warn;
      }else{
         l.w = l.log;
      }

      if (console.error){
         l.e = l.error;
      }else{
         l.e = l.log;
      }
   }


   function addFile(file){

      var id = files.length;
      files.push(new FileUpload(extend({
         info: function(){},
         progress: function(){},
         complete: function(){},
         error: function(){}
      },file,{
         id: id,
         status: PENDING,
         priority: 0,
         onStatusChange: onFileUploadStatusChange,
         loadedBytes: 0,
         sizeBytes: file.file.size
      })));
      return id;
   }

   function onFileUploadStatusChange(){

      l.d('onFileUploadStatusChange');
      processQueue();

   }


   function asynProcessQueue(){

      setTimeout(processQueue,1);
   }

   function processQueue(){

      l.d('processQueue   length: ' + files.length);
      var next = -1, priorityOfNext = -1, readyForNext = true;
      files.forEach(function(file,i){

         if (file.priority > priorityOfNext && file.status == PENDING){
            next = i;
            priorityOfNext = file.priority;
         }

         if (file.status == EVAPORATING){
            readyForNext = false;
         }
      });

      if (readyForNext && next >= 0){
         files[next].start();
      }
   }



   function FileUpload(file){

      var __ = this, parts = [], progressTick, countUploadAttempts = 0;
      extend(__,file);

      __.start = function(){

         l.d('starting FileUpload ' + __.id);

         setStatus(EVAPORATING);
         initiateUpload();
         monitorProgress();
      };

      __.stop = function(){


      };


      function setupRequest(requester){

         l.d('setupRequest()',requester);

         requester.dateString = new Date().toUTCString();
         requester.x_amz_headers = extend(requester.x_amz_headers,{
            'x-amz-date': requester.dateString
         });

         requester.onGotAuth = function (){

            var xhr = new XMLHttpRequest();
            var payload = requester.toSend ? requester.toSend() : null;
            var url = AWS_URL + requester.path;

            if (con.simulateErrors && requester.attempts == 1 &&requester.step == 'upload #3'){
               l.d('simulating error by POST part #3 to invalid url');
               url = 'https:///foo';
            }

            xhr.open(requester.method, url);
            xhr.setRequestHeader('Authorization', 'AWS ' + con.aws_key + ':' + requester.auth);

            if (requester.contentType){
               xhr.setRequestHeader('Content-Type', requester.contentType);
            }

            for (var key in requester.x_amz_headers) {
               if (requester.x_amz_headers.hasOwnProperty(key)) {
                  xhr.setRequestHeader(key, requester.x_amz_headers[key]);
               }
            }


            xhr.onreadystatechange = function(){

               if (xhr.readyState == 4){

                  if(payload){l.d('  ### ' + payload.size);} // Test, per http://code.google.com/p/chromium/issues/detail?id=167111#c20
                  if (xhr.status == 200){
                     requester.on200(xhr);
                  } else {
                     requester.onErr(xhr);
                  }
               }
            };

            xhr.onerror = function(){requester.onErr(xhr,true);};

            if (typeof requester.onProgress == 'function'){
               xhr.upload.onprogress = function(evt){
                  requester.onProgress(evt);
               };
            }
            xhr.send(payload);
         };

         requester.onFailedAuth = requester.onFailedAuth || function(xhr){
            __.error('Error getting auth for ' + requester.step);
            requester.onErr(xhr);
         };
      }


      //see: http://docs.amazonwebservices.com/AmazonS3/latest/dev/RESTAuthentication.html#ConstructingTheAuthenticationHeader
      function authorizedSend(authRequester){

         l.d('authorizedSend() ' + authRequester.step);
         var xhr = new XMLHttpRequest(),
         url = con.signerUrl+'?to_sign='+makeStringToSign(authRequester);

         for (var param in __.signParams) {
            if (!__.signParams.hasOwnProperty(param)) {continue;}
            url += ('&'+escape(param)+'='+escape(__.signParams[param]));
         }

         xhr.onreadystatechange = function(){

            if (xhr.readyState == 4){

               if (xhr.status == 200 ){ //&& xhr.response.length == 28

                  l.d('authorizedSend got signature for step: \'' + authRequester.step + '\'    sig: '+ xhr.response);
                  authRequester.auth = xhr.response;
                  authRequester.onGotAuth();

               } else {
                  l.w('xhr.onreadystatechange got status: ' + xhr.status  + ' while trying to get authorization for step: \'' + authRequester.step + '\'');
                  authRequester.onFailedAuth(xhr);
               }

            }
         };

         xhr.onerror = function(){
            l.w('xhr.onerror handled whilst attempting to get authorization for step: \'' + authRequester.step + '\'');
            authRequester.onFailedAuth(xhr);
         };

         xhr.open('GET', url);
         xhr.send();
      }


      function initiateUpload(){ // see: http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadInitiate.html

         var initiate = {
            method: 'POST',
            path: '/' + con.bucket + '/' + __.name + '?uploads',
            step: 'initiate',
            x_amz_headers: __.xAmzHeadersAtInitiate
         };

         initiate.onErr = function(xhr){
            l.d('onInitiateError for FileUpload ' + __.id);
            setStatus(ERROR);
         };

         initiate.on200 = function(xhr){

            var match = xhr.response.match(/<UploadId\>(.+)<\/UploadId\>/);
            if (match && match[1]){
               __.uploadId = match[1];
               l.d('requester success. got uploadId ' + __.uploadId);
               makeParts();
               processPartsList();
            }else{
               initiate.onErr();
            }
         };

         setupRequest(initiate);
         authorizedSend(initiate);
      }


      function uploadPart(partNumber){  //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadUploadPart.html

         var backOff, hasErrored;

         parts[partNumber].status = EVAPORATING;
         countUploadAttempts++;

         backOff = parts[partNumber].attempts++ === 0 ? 0 : 1000 * Math.min(
            con.maxRetryBackoffSecs,
            Math.pow(con.retryBackoffPower,parts[partNumber].attempts-2)
         );
         l.d('uploadPart #' + partNumber + '     will wait ' + backOff + 'ms to try');

         setTimeout(function(){

            var upload = {
               method: 'PUT',
               path: '/' + con.bucket + '/' + __.name + '?partNumber='+partNumber+'&uploadId='+__.uploadId,
               step: 'upload #' + partNumber,
               attempts: parts[partNumber].attempts
            };
            // TODO: add md5

            upload.onErr = function (xhr, isOnError){

               var msg = 'problem uploading part #' + partNumber + '  http status: ' + xhr.status +
               (isOnError ? ',  isOnError' : '') + ',   part status: ' + parts[partNumber].status;

               l.d(msg, hasErrored);
               __.info(msg);

               if (hasErrored){
                  return;
               }
               hasErrored = true;

               if (xhr.status == 404){
                   var errMsg = '404 error resulted in abortion of both this part and the entire file.';
                   l.w(errMsg + ' Server response: ' + xhr.response);
                   __.error(errMsg);
                   // TODO: kill off other uploading parts when file is aborted
                   parts[partNumber].status = ABORTED;
                   setStatus(ABORTED);
               } else {
                  parts[partNumber].status = ERROR;
                  parts[partNumber].loadedBytes = 0;
                  processPartsList();
               }
               // TODO: does AWS have other error codes that we can handle?
            };

            upload.on200 = function (xhr){

               var eTag = xhr.getResponseHeader('ETag'), msg;
               l.d('uploadPart 200 response for part #' + partNumber + '     ETag: ' + eTag);
               if (eTag != ETAG_OF_0_LENGTH_BLOB){
                  parts[partNumber].eTag = eTag;
                  parts[partNumber].status = COMPLETE;
               }else{
                  parts[partNumber].status = ERROR;
                  parts[partNumber].loadedBytes = 0;
                  msg = 'eTag matches MD5 of 0 length blob for part #' + partNumber  + '   Retrying part.';
                  l.w(msg);
                  __.info(msg);
               }
               processPartsList();
            };

            upload.onProgress = function (evt){

               parts[partNumber].loadedBytes = evt.loaded;
            };
            var slicerFn = (__.file.slice ? 'slice' : (__.file.mozSlice ? 'mozSlice' : 'webkitSlice'));
            // browsers' implementation of the Blob.slice function has been renamed a couple of times, and the meaning of the 2nd parameter changed. For example Gecko went from slice(start,length) -> mozSlice(start, end) -> slice(start, end). As of 12/12/12, it seems that the unified 'slice' is the best bet, hence it being first in the list. See https://developer.mozilla.org/en-US/docs/DOM/Blob for more info.

            upload.toSend = function() {
               var part = __.file[slicerFn](parts[partNumber].start, parts[partNumber].end);
               l.d('sending part # ' + partNumber + ' (bytes ' + parts[partNumber].start + ' -> ' + parts[partNumber].end + ')  reported length: ' + part.size);
               if (part.size === 0){
                  l.w('  *** WARN: blob reporting size of 0 bytes. Will try upload anyway..');
               }
               return part;
            };

            upload.onFailedAuth = function(xhr){

               var msg = 'onFailedAuth for uploadPart #' + partNumber + '.   Will set status to ERROR';
               l.w(msg);
               __.info(msg);
               parts[partNumber].status = ERROR;
               parts[partNumber].loadedBytes = 0;
               processPartsList();
            };

            setupRequest(upload);
            authorizedSend(upload);

         },backOff);
      }


      function completeUpload(){ //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html

         l.d('completeUpload');
         __.info('will attempt to complete upload');
         
         var completeDoc = '<CompleteMultipartUpload>';
         parts.forEach(function(part,partNumber){
            if (part){
               completeDoc += '<Part><PartNumber>' + partNumber + '</PartNumber><ETag>' + part.eTag + '</ETag></Part>';
            }
         });
         completeDoc += '</CompleteMultipartUpload>';

         var complete = {
            method: 'POST',
            contentType: 'application/xml; charset=UTF-8',
            path: '/' + con.bucket + '/' + __.name + '?uploadId='+__.uploadId,
            step: 'complete'
         };

         complete.onErr = function (){
            var msg = 'Error completing upload.  id: ' + __.id;
            l.w(msg);
            __.error(msg);
            setStatus(ERROR);
         };

         complete.on200 = function(xhr){
            __.complete();
            setStatus(COMPLETE);
         };

         complete.toSend = function() {
            return completeDoc;
         };

         setupRequest(complete);
         authorizedSend(complete);
      }


      function makeParts(){

         var numParts = Math.ceil(__.file.size / con.partSize);
         for (var part = 1; part <= numParts; part++){

            parts[part] = {
               status: PENDING,
               start: (part-1)*con.partSize,
               end: (part*con.partSize),
               attempts: 0,
               loadedBytes: 0
            };
         }
      }


      function processPartsList(){

         var evaporatingCount = 0, finished = true, stati = [], bytesLoaded = [], info;
         parts.forEach(function(part,i){

            stati.push(part.status);
            if (part){
               switch(part.status){

                  case EVAPORATING:
                     finished = false;
                     evaporatingCount++;
                     bytesLoaded.push(part.loadedBytes);
                     break;

                  case ERROR:
                  case PENDING:
                     finished = false;
                     if (evaporatingCount < con.maxConcurrentParts){
                        uploadPart(i);
                        evaporatingCount++;
                     }
                     break;

                  default:
                     break;
               }
            }
         });
         
         info = stati.toString() + '  ' + bytesLoaded.toString();
         l.d('processPartsList() ' + info);

         if (countUploadAttempts >= (parts.length-1)){
            __.info('part stati: ' + info);
         }
         // parts.length is always 1 greater than the actually number of parts, because AWS part numbers start at 1, not 0, so for a 3 part upload, the parts array is: [undefined, object, object, object], which has length 4.

         if (finished){
            completeUpload();
         }
      }


      function monitorProgress(){

         progressTick = setInterval(function(){

            var totalBytesLoaded = 0;
            parts.forEach(function(part,i){
               totalBytesLoaded += part.loadedBytes;
            });

            __.progress(totalBytesLoaded/__.sizeBytes);


         },con.progressIntervalMS);
      }


      function setStatus(s){
         if (s == COMPLETE || s == ERROR){
            clearInterval(progressTick);
         }
         __.status = s;
         __.onStatusChange();
      }


      function makeStringToSign(request){

         var x_amz_headers = '', to_sign, header_key_array = [];

         for (var key in request.x_amz_headers) {
            if (request.x_amz_headers.hasOwnProperty(key)) {
               header_key_array.push(key);
            }
         }
         header_key_array.sort();

         header_key_array.forEach(function(header_key,i){
            x_amz_headers += (header_key + ':'+ request.x_amz_headers[header_key] + '\n');
         });


         to_sign = request.method+'\n'+
            '\n'+
            (request.contentType || '')+'\n'+
            '\n'+
            x_amz_headers +
            request.path;
         return escape(to_sign);
      }
   }


   function extend(obj1, obj2, obj3){

      if (typeof obj1 == 'undefined'){obj1 = {};}

      if (typeof obj3 == 'object'){
         for (var key in obj3){
            obj2[key]=obj3[key];
         }
      }

      for (var key2 in obj2){
         obj1[key2]=obj2[key2];
      }
      return obj1;
   }

};

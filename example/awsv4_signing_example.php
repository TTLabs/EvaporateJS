<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Carbon\Carbon;
use Validator;

/*
This code is based on Laravel, it can be adopted to any PHP platform
just make sure that you sign in the same exact order in the same exact way
otherwise the signature will be wrong
*/


class EvaporateJSController extends Controller
{
  /**
   * Generates AWS S3 signature to allow EvaporateJS to upload directly to S3
   * @param  Request ['to_sign', 'datetime']
   * @return response json signature
   */
  public function getS3Signature(Request $request)
  {
      // make sure you are getting the correct values from EvaporateJS, otherwise stop
      $validationRules =  [
        'to_sign' => ['bail','required'],
        'datetime' => ['bail','required'],
      ];

      $validation = Validator::make($request->all(), $validationRules);
      if ($validation->fails()) {
          //let's just return plain text
          return response($validation->errors()->first(), 422);
          // $response = ["success"=>false, "message"=>['errors'=>$validation->errors()->all()]];
          // return response()->json($response);
      }

      //the data is correct here use them
      $to_sign = $request->get('to_sign');
      $dateTime = $request->get('datetime');

      //format the datetime to the correct format AWS expect
      $formattedDate = Carbon::parse($dateTime)->format('Ymd');

      //make the Signature, notice that we use env for saving AWS keys and regions

      $kSecret = "AWS4" . env('AWS_SECRET_ACCESS_KEY');
      $kDate = hash_hmac("sha256", $formattedDate, $kSecret, true);
      $kRegion = hash_hmac("sha256", env('AWS_REGION'), $kDate, true);
      $kService = hash_hmac("sha256", 's3', $kRegion, true);
      $kSigning = hash_hmac("sha256", "aws4_request", $kService, true);
      $signature = hash_hmac("sha256", $to_sign, $kSigning);
      // return response()->json(["success"=>true, "signature"=>$signature]);
      //let's just return plain text
      return response($signature);
  }

}

?>
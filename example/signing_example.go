// You need to import the following:
import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	)

// this example is using Martini
m.Get("/sign_auth", func(w http.ResponseWriter, r *http.Request) {
    // Todo: Authenticate the request
		log.Println("signing")
		qs := r.URL.Query()
		mac := hmac.New(sha1.New, []byte("AWS_SECRET"))
		mac.Write([]byte(qs.Get("to_sign")))
		encoded := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		w.Write([]byte(encoded))
	})

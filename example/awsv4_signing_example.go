// You need to import the following:
import (
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"log"
	"net/http"
	"strings"
)

var (
	date        string
	regionName  string
	serviceName string
	requestName string
)

// this example is using Martini
m.Get("/sign_auth", func(w http.ResponseWriter, r *http.Request) {
    // Todo: Authenticate the request	log.Println("signing")
	qs := req.URL.Query()

	strs := strings.Split(qs.Get("to_sign"), "\n")
	data := strings.Split(strs[2], "/")
	date, regionName, serviceName, requestName = data[0], data[1], data[2], data[3]

	signedKey := signature(date, qs.Get("to_sign"))

	w.Write([]byte(signedKey))
}

func signature(t, sts string) string {
	h := HMAC(derivedKey(t), []byte(sts))
	return fmt.Sprintf("%x", h)
}

func derivedKey(t string) []byte {
	h := HMAC([]byte("AWS4"+"AWS_SECRET"), []byte(t))
	h = HMAC(h, []byte(regionName))
	h = HMAC(h, []byte(serviceName))
	h = HMAC(h, []byte(requestName))
	return h
}

func HMAC(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

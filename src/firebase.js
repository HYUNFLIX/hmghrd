import { initializeApp } from 'https://esm.sh/firebase@12.10.0/app'
import { getFirestore } from 'https://esm.sh/firebase@12.10.0/firestore'
import { getAuth } from 'https://esm.sh/firebase@12.10.0/auth'

const app = initializeApp({
  apiKey:            'AIzaSyDZDvl34tixYjKvDZwfsWmB0xqleE950rY',
  authDomain:        'hmghrd-survey.firebaseapp.com',
  projectId:         'hmghrd-survey',
  storageBucket:     'hmghrd-survey.firebasestorage.app',
  messagingSenderId: '410748410266',
  appId:             '1:410748410266:web:364e5ee50fc6efb7c94223',
})

export const db   = getFirestore(app)
export const auth = getAuth(app)

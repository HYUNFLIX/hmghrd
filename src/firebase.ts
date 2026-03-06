import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            'AIzaSyDZDvl34tixYjKvDZwfsWmB0xqleE950rY',
  authDomain:        'hmghrd-survey.firebaseapp.com',
  projectId:         'hmghrd-survey',
  storageBucket:     'hmghrd-survey.firebasestorage.app',
  messagingSenderId: '410748410266',
  appId:             '1:410748410266:web:364e5ee50fc6efb7c94223',
}

const app = initializeApp(firebaseConfig)
export const db   = getFirestore(app)
export const auth = getAuth(app)

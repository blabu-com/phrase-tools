import fetch from 'node-fetch'
import FormData from 'form-data'

// tslint:disable-next-line:no-any
const glob = global as any
glob.fetch = fetch
glob.FormData = FormData
glob.atob = (a: string) => Buffer.from(a, 'base64').toString('binary')
glob.btoa = (b: ArrayBuffer | SharedArrayBuffer) => Buffer.from(b).toString('base64')

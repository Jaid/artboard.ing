import {GlobalRegistrator} from '@happy-dom/global-registrator'

GlobalRegistrator.register({url: 'http://localhost/'})
// Components must neither reach the local gateway nor the provider while testing.
globalThis.fetch = (async () => Response.json({error: {message: 'Offline in tests.'}}, {status: 503})) as unknown as typeof fetch

import { IconContext } from '@phosphor-icons/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SuperTokensWrapper } from 'supertokens-auth-react'
import App from './App'
import { initAuth } from './auth'
import './index.css'
import { previewRole } from './preview'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

async function start() {
  // `import.meta.env.DEV` is false in production builds, so the sample data is dropped there.
  const preview = import.meta.env.DEV && previewRole !== null
  if (import.meta.env.DEV && previewRole) {
    const { installMockApi } = await import('./dev/mockApi')
    installMockApi(previewRole)
  } else {
    initAuth()
  }

  const app = (
    <IconContext.Provider value={{ weight: 'bold', size: 18 }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </IconContext.Provider>
  )

  createRoot(document.getElementById('root')!).render(
    <StrictMode>{preview ? app : <SuperTokensWrapper>{app}</SuperTokensWrapper>}</StrictMode>,
  )
}

void start()

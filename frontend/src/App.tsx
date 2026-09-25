import * as reactRouter from 'react-router'
import { Navigate, Route, Routes } from 'react-router'
import { getSuperTokensRoutesForReactRouterDom } from 'supertokens-auth-react/ui'
import { EmailPasswordPreBuiltUI } from 'supertokens-auth-react/recipe/emailpassword/prebuiltui'
import { SessionAuth } from 'supertokens-auth-react/recipe/session'
import AppShell from './components/AppShell'
import AccountPage from './pages/AccountPage'
import BranchesTab from './pages/BranchesTab'
import InvitePage from './pages/InvitePage'
import MembersTab from './pages/MembersTab'
import PeopleTab from './pages/PeopleTab'
import PersonPage from './pages/PersonPage'
import SettingsTab from './pages/SettingsTab'
import TreeHome from './pages/TreeHome'
import TreeLayout from './pages/TreeLayout'
import TreesPage from './pages/TreesPage'
import YouPage from './pages/YouPage'
import { previewRole } from './preview'

// Preview mode runs on sample data without SuperTokens, so skip its routes and session guard.
const preview = import.meta.env.DEV && previewRole !== null

export default function App() {
  return (
    <Routes>
      {!preview && getSuperTokensRoutesForReactRouterDom(reactRouter, [EmailPasswordPreBuiltUI])}
      <Route
        element={
          preview ? (
            <AppShell />
          ) : (
            <SessionAuth>
              <AppShell />
            </SessionAuth>
          )
        }
      >
        <Route index element={<TreesPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="trees/:treeId" element={<TreeLayout />}>
          <Route index element={<TreeHome />} />
          <Route path="people" element={<PeopleTab />} />
          <Route path="people/:personId" element={<PersonPage />} />
          <Route path="branches" element={<BranchesTab />} />
          <Route path="members" element={<MembersTab />} />
          <Route path="settings" element={<SettingsTab />} />
          <Route path="you" element={<YouPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

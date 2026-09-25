import SuperTokens from 'supertokens-auth-react'
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword'
import Session from 'supertokens-auth-react/recipe/session'

export function initAuth() {
  SuperTokens.init({
    appInfo: {
      appName: 'TheFamilyVine',
      apiDomain: window.location.origin,
      websiteDomain: window.location.origin,
      apiBasePath: '/api/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      EmailPassword.init({
        signInAndUpFeature: {
          signUpForm: {
            // State the backend's password rule up front instead of only after a failed submit.
            formFields: [
              { id: 'password', label: 'Password', placeholder: '8+ characters, including a number' },
            ],
          },
          // Sign-in inherits sign-up's field settings unless given its own.
          signInForm: {
            formFields: [{ id: 'password', label: 'Password', placeholder: 'Password' }],
          },
        },
      }),
      Session.init(),
    ],
    // Sentence case, to match the rest of the app.
    languageTranslations: {
      translations: {
        en: {
          AUTH_PAGE_HEADER_TITLE_SIGN_IN: 'Sign in',
          AUTH_PAGE_HEADER_TITLE_SIGN_UP: 'Create your account',
          AUTH_PAGE_HEADER_SUBTITLE_SIGN_IN_SIGN_UP_LINK: 'Create an account',
          AUTH_PAGE_HEADER_SUBTITLE_SIGN_UP_SIGN_IN_LINK: 'Sign in',
          EMAIL_PASSWORD_SIGN_IN_SUBMIT_BTN: 'Sign in',
          EMAIL_PASSWORD_SIGN_UP_SUBMIT_BTN: 'Create account',
          EMAIL_PASSWORD_RESET_SIGN_IN_LINK: 'Sign in',
          EMAIL_PASSWORD_RESET_SUBMIT_PW_SUCCESS_SIGN_IN_BTN: 'Sign in',
        },
      },
    },
    // Matches the app's tokens in index.css (warm monochrome, serif titles, flat bordered card).
    style: `
      [data-supertokens~=container] {
        --palette-background: 255, 255, 255;
        --palette-inputBackground: 255, 255, 255;
        --palette-inputBorder: 234, 234, 234;
        --palette-primary: 17, 17, 17;
        --palette-primaryBorder: 17, 17, 17;
        --palette-buttonText: 255, 255, 255;
        --palette-textTitle: 17, 17, 17;
        --palette-textLabel: 17, 17, 17;
        --palette-textInput: 17, 17, 17;
        --palette-textPrimary: 120, 119, 116;
        --palette-textLink: 17, 17, 17;
        --palette-textGray: 120, 119, 116;
        --palette-secondaryText: 120, 119, 116;
        --palette-error: 159, 47, 45;
        --palette-errorBackground: 253, 235, 236;
        --palette-success: 52, 101, 56;
        --palette-successBackground: 237, 243, 236;
        font-family: Geist, "Helvetica Neue", system-ui, sans-serif;
        border: 1px solid #eaeaea;
        border-radius: 12px;
        box-shadow: none;
        margin-top: 10vh;
      }
      [data-supertokens~=headerTitle] {
        font-family: Newsreader, Georgia, serif;
        font-weight: 500;
        font-size: 30px;
        letter-spacing: -0.02em;
      }
      [data-supertokens~=label] { font-weight: 500; }
      [data-supertokens~=inputWrapper] { border-radius: 6px; box-shadow: none; }
      [data-supertokens~=button] {
        border-radius: 6px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        transition: background 150ms, transform 120ms;
      }
      [data-supertokens~=button]:hover { background: #333333; border-color: #333333; }
      [data-supertokens~=button]:active { transform: scale(0.98); }
      [data-supertokens~=superTokensBranding] { display: none; }
      @media (prefers-color-scheme: dark) {
        [data-supertokens~=container] {
          --palette-background: 31, 31, 30;
          --palette-inputBackground: 25, 25, 24;
          --palette-inputBorder: 47, 47, 45;
          --palette-primary: 237, 237, 234;
          --palette-primaryBorder: 237, 237, 234;
          --palette-buttonText: 17, 17, 17;
          --palette-textTitle: 243, 242, 238;
          --palette-textLabel: 243, 242, 238;
          --palette-textInput: 243, 242, 238;
          --palette-textPrimary: 155, 154, 150;
          --palette-textLink: 243, 242, 238;
          --palette-textGray: 155, 154, 150;
          --palette-secondaryText: 155, 154, 150;
          --palette-errorBackground: 58, 34, 33;
          --palette-error: 240, 161, 156;
          border-color: #2f2f2d;
        }
        [data-supertokens~=button]:hover { background: #d6d5d1; border-color: #d6d5d1; }
      }
    `,
  })
}

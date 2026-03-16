import { extendTheme, defineStyleConfig } from '@chakra-ui/react'

const theme = extendTheme({
  config: {
    initialColorMode: 'dark' as const,
    useSystemColorMode: false,
  },

  colors: {
    // Override Chakra's gray scale with Base16 Twilight values
    gray: {
      50: '#e8e8e8',
      100: '#c3c3c3', // base06 — light foreground
      200: '#a7a7a7', // base05 — default foreground
      300: '#838184', // base04 — secondary text
      400: '#5f5a60', // base03 — muted text
      500: '#464b50', // base02 — selection/highlight
      600: '#3a3d40', // interpolated
      700: '#2d2f31', // line — borders
      800: '#252525', // chromeLine — subtle borders
      900: '#1f1f1f', // backgroundSubtleLight — panels
      950: '#1b1b1b', // backgroundDarker — nested cards
    },

    // Reactotron's signature burnt orange (base08: #cf6a4c)
    reactotron: {
      50: '#fef2ee',
      100: '#fce0d6',
      200: '#f5b9a6',
      300: '#e89176',
      400: '#d97e5e',
      500: '#cf6a4c',
      600: '#b85a3e',
      700: '#9e4a33',
      800: '#833d2a',
      900: '#6a3122',
    },

    // Twilight muted purple for Session B identity (base0E: #9b859d)
    twilightPurple: {
      50: '#f5f0f5',
      100: '#e8dee8',
      200: '#d1bdd1',
      300: '#b9a0ba',
      400: '#a790a8',
      500: '#9b859d',
      600: '#87728a',
      700: '#725f74',
      800: '#5d4d5f',
      900: '#4a3d4b',
    },

    // Named Twilight accent colors for one-off usage
    twilight: {
      amber: '#cda869', // base09 — constants, data values
      green: '#8f9d6a', // base0B — strings, additions
      blue: '#7587a6', // base0D — headings
      steel: '#afc4db', // base0C — support tokens
      yellow: '#f9ee98', // base0A — bold/emphasis
      warning: '#9b703f', // base0F — warnings
    },
  },

  fonts: {
    mono: "'Fira Code', SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  styles: {
    global: {
      'html, body, #root': {
        minHeight: '100%',
      },
      body: {
        bg: '#151515',
        color: 'gray.100',
      },
      'code, pre, kbd, samp': {
        fontVariantLigatures: 'none',
      },
    },
  },

  components: {
    Button: defineStyleConfig({
      variants: {
        subtle: {
          bg: 'transparent',
          color: 'gray.200',
          borderWidth: '1px',
          borderColor: 'gray.600',
          _hover: {
            color: 'gray.50',
            bg: 'gray.700',
          },
        },
      },
    }),
    Tabs: {
      defaultProps: {
        colorScheme: 'reactotron',
      },
    },
  },
})

export default theme

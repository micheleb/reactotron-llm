import { useEffect, useState } from 'react'
import {
  Box,
  Code,
  Heading,
  HStack,
  Link,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react'

import CopyButton from './CopyButton'

type HealthResponse = {
  ok: boolean
  port: number
  dashboardWsPort: number
}

type Props = {
  apiBase: string
}

function CodeWithCopy({ text }: { text: string }) {
  return (
    <HStack bg="gray.950" borderWidth="1px" borderColor="gray.700" borderRadius="md" px={3} py={2}>
      <Code flex={1} bg="transparent" color="twilight.amber" fontSize="sm">{text}</Code>
      <CopyButton getText={() => text} label="Copy command" />
    </HStack>
  )
}

export default function LivePlaceholderView({ apiBase }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchHealth() {
      try {
        const res = await fetch(`${apiBase}/health`)
        const json = await res.json()
        if (!cancelled) setHealth(json)
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchHealth()
    return () => { cancelled = true }
  }, [apiBase])

  const port = health?.port ?? 9090

  return (
    <Box p={6} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxW="700px" mx="auto">
      <VStack align="stretch" spacing={5}>
        <Box textAlign="center">
          <Heading size="md" color="gray.100" mb={2}>Waiting for a client to connect…</Heading>
          {loading ? (
            <Spinner size="sm" color="reactotron.400" />
          ) : (
            <Text fontSize="sm" color="gray.400">
              Proxy listening on port <Code bg="transparent" color="reactotron.300">{port}</Code>
              {' · '}WS URL <Code bg="transparent" color="reactotron.300">ws://localhost:{port}</Code>
            </Text>
          )}
        </Box>

        <Box>
          <Heading size="sm" color="gray.200" mb={3}>Connection Tips</Heading>
          <VStack align="stretch" spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight={600} color="gray.200" mb={1}>Android physical device</Text>
              <Text fontSize="xs" color="gray.400" mb={2}>
                Forward the proxy port over USB so the device can reach localhost:
              </Text>
              <CodeWithCopy text={`adb reverse tcp:${port} tcp:${port}`} />
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight={600} color="gray.200" mb={1}>Android emulator</Text>
              <Text fontSize="xs" color="gray.400">
                Use <Code bg="transparent" color="twilight.amber" fontSize="xs">10.0.2.2</Code> instead
                of <Code bg="transparent" fontSize="xs">localhost</Code> as the Reactotron host. The
                emulator's loopback is its own — <Code bg="transparent" fontSize="xs">10.0.2.2</Code> maps
                to the host machine.
              </Text>
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight={600} color="gray.200" mb={1}>iOS simulator</Text>
              <Text fontSize="xs" color="gray.400">
                <Code bg="transparent" fontSize="xs">localhost</Code> should work. If not, check your
                macOS firewall settings.
              </Text>
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight={600} color="gray.200" mb={1}>General</Text>
              <Text fontSize="xs" color="gray.400">
                Confirm your app's <Code bg="transparent" fontSize="xs">Reactotron.configure({'{'} host, port {'}'})</Code> matches
                the values above.
              </Text>
            </Box>
          </VStack>
        </Box>

        <Box textAlign="center" pt={2}>
          <Link
            href="https://github.com/micheleb/reactotron-llm#readme"
            isExternal
            color="reactotron.400"
            fontSize="sm"
            _hover={{ color: 'reactotron.300' }}
          >
            View README for setup instructions
          </Link>
        </Box>
      </VStack>
    </Box>
  )
}

import { CheckIcon, CopyIcon } from '@chakra-ui/icons'
import { IconButton, Tooltip, useDisclosure } from '@chakra-ui/react'
import { useCallback, useRef, useState } from 'react'

import ClipboardFallbackModal from './ClipboardFallbackModal'

type CopyButtonProps = {
  getText: () => string
  label?: string
  size?: string
}

export default function CopyButton({ getText, label = 'Copy as markdown', size = 'xs' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [fallbackContent, setFallbackContent] = useState('')

  const handleCopy = useCallback(async () => {
    const text = getText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      setFallbackContent(text)
      onOpen()
    }
  }, [getText, onOpen])

  return (
    <>
      <Tooltip label={copied ? 'Copied!' : label} placement="top" hasArrow>
        <IconButton
          aria-label={label}
          icon={copied ? <CheckIcon /> : <CopyIcon />}
          size={size}
          variant="ghost"
          color={copied ? 'twilight.green' : 'gray.400'}
          _hover={{ color: copied ? 'twilight.green' : 'gray.200' }}
          onClick={handleCopy}
        />
      </Tooltip>
      <ClipboardFallbackModal isOpen={isOpen} onClose={onClose} content={fallbackContent} />
    </>
  )
}

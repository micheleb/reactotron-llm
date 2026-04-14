import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
} from '@chakra-ui/react'

type ClipboardFallbackModalProps = {
  isOpen: boolean
  onClose: () => void
  content: string
}

export default function ClipboardFallbackModal({ isOpen, onClose, content }: ClipboardFallbackModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent bg="gray.900" borderColor="gray.700" borderWidth="1px">
        <ModalHeader color="gray.100">Copy to Clipboard</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Text fontSize="sm" color="gray.400" mb={3}>
            Automatic copy failed. Select all text below and copy manually (Ctrl+A, Ctrl+C).
          </Text>
          <Textarea
            value={content}
            readOnly
            rows={16}
            fontFamily="mono"
            fontSize="sm"
            bg="gray.950"
            borderColor="gray.700"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

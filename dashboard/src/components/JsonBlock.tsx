import { CopyIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Box, Code, IconButton, Text, Tooltip } from "@chakra-ui/react";
import { useState } from "react";

import { formatJson } from "../utils/normalize";
import JsonView from "./JsonView";

type JsonBlockProps = {
  value: unknown;
  // Shown in place of the tree when value is null or undefined.
  placeholder?: string;
};

export default function JsonBlock({ value, placeholder }: JsonBlockProps) {
  const [structured, setStructured] = useState(true);
  const isEmpty = value === null || value === undefined;

  if (isEmpty && placeholder) {
    return (
      <Box p={2} bg="gray.950" borderRadius="md">
        <Text fontSize="sm" color="gray.400" fontStyle="italic">
          {placeholder}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      position="relative"
      bg="gray.950"
      borderRadius="md"
      p={2}
      pr={16}
      maxW="100%"
      overflowX="auto"
      data-testid={structured ? "json-tree" : "json-text"}
    >
      <Box
        position="absolute"
        top={1}
        right={1}
        display="flex"
        gap={1}
        zIndex={1}
      >
        <Tooltip label="Copy JSON" placement="top">
          <IconButton
            aria-label="Copy JSON"
            icon={<CopyIcon />}
            size="xs"
            variant="ghost"
            onClick={() => {
              navigator.clipboard
                .writeText(formatJson(value))
                .catch(() => undefined);
            }}
          />
        </Tooltip>
        <Tooltip
          label={structured ? "Show as text" : "Show as tree"}
          placement="top"
        >
          <IconButton
            aria-label={structured ? "Show as text" : "Show as tree"}
            aria-pressed={!structured}
            icon={structured ? <ViewOffIcon /> : <ViewIcon />}
            size="xs"
            variant="ghost"
            onClick={() => setStructured((s) => !s)}
            data-testid="json-view-toggle"
          />
        </Tooltip>
      </Box>
      {structured ? (
        <JsonView value={value} defaultExpandDepth={2} />
      ) : (
        <Code
          whiteSpace="pre-wrap"
          wordBreak="break-word"
          overflowWrap="anywhere"
          display="block"
          p={0}
          bg="transparent"
          color="gray.100"
          fontSize="sm"
        >
          {formatJson(value)}
        </Code>
      )}
    </Box>
  );
}

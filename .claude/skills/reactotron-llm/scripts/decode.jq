# Reactotron serializes some primitives as sentinel strings ("~~~ false ~~~").
# `decode` walks any value and restores them. Compose it into a jq program:
#   DECODE=$(cat ~/.claude/skills/reactotron-llm/scripts/decode.jq)
#   curl -s "$BASE/api/sessions/$SID/events" | jq "$DECODE"' .events[] | decode | ...'
def decode: walk(
  if type == "string" then
    if   . == "~~~ false ~~~"                          then false
    elif . == "~~~ true ~~~"                           then true
    elif . == "~~~ null ~~~" or . == "~~~ undefined ~~~" then null
    elif . == "~~~ zero ~~~"                           then 0
    elif . == "~~~ empty string ~~~"                   then ""
    else . end
  else . end
);

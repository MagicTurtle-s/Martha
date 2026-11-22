#!/usr/bin/env bash
#
# Martha voice notes: a new key for this computer, a key for a second computer in the household, or
# a read-only key for a phone's Claude (VOICE-SETUP.md, "A new key for this computer", "A second
# computer" and "Reading notes from a phone"). Run it after voice-setup.sh has built everything
# once, in Git Bash on Windows or a terminal on macOS or Linux:
#   bash alexa/setup/voice-key.sh computer    # replaces this computer's key file
#   bash alexa/setup/voice-key.sh computer2   # makes a key file to carry to a second computer
#   bash alexa/setup/voice-key.sh phone       # makes a read-only key file for a phone
#
# It finds the region the build lives in, updates the build (so the key users and what they may do
# match alexa/infra/martha-voice.yaml), asks AWS's own policy simulator what the key's user may do
# and stops if that is anything other than it should be, makes the user one key, and saves it with
# martha_voice.py, which checks it. A key is never shown. AWS allows a user two keys; the script
# stops at two, and after a new computer key it offers to delete the computer's older key (its
# secret is no longer on this computer once the new one is saved). A second computer's or a phone's
# older key is left alone: it may still be in use on that device.

set -euo pipefail

WHO="${1:-}"
# What the policy simulator must allow, as action@item-kind (notes, the context record, or the
# shared household profile). A computer reads and files notes, writes the context, and reads and
# saves the household; a phone only reads notes and the household.
COMPUTER_MAY=$'dynamodb:DeleteItem@note\ndynamodb:GetItem@household\ndynamodb:PutItem@context\ndynamodb:PutItem@household\ndynamodb:Query@household\ndynamodb:Query@note'
case "$WHO" in
  computer)  KEY_USER=martha-voice-pc;   ALLOWED_WANT="$COMPUTER_MAY"; LABEL=computer ;;
  computer2) KEY_USER=martha-voice-pc-2; ALLOWED_WANT="$COMPUTER_MAY"; LABEL="second computer" ;;
  phone)     KEY_USER=martha-voice-phone; LABEL=phone
             ALLOWED_WANT=$'dynamodb:GetItem@household\ndynamodb:Query@household\ndynamodb:Query@note' ;;
  *) printf 'usage: bash alexa/setup/voice-key.sh computer|computer2|phone\n' >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SCRIPTS="$ROOT/.claude/skills/martha/scripts"
export AWS_PAGER=""
# Git Bash rewrites arguments that start with "/" into Windows paths (see voice-setup.sh).
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
ENV_FILE="${MARTHA_VOICE_SETUP_ENV:-$HOME/.martha/voice-setup.env}"
PHONE_DIR="${MARTHA_PHONE_KEY_DIR:-$HOME/.martha/phone-key}"
SECOND_DIR="${MARTHA_SECOND_KEY_DIR:-$HOME/.martha/second-computer-key}"
STACK=martha-voice

say()  { printf '  %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1" >&2; }

_find() {
  local name="$1" c; shift
  if type -P "$name" >/dev/null 2>&1; then type -P "$name"; return 0; fi
  for c in "$@"; do [[ -x "$c" ]] && { printf '%s' "$c"; return 0; }; done
  return 1
}
AWS=$(_find aws "/c/Program Files/Amazon/AWSCLIV2/aws.exe" /usr/local/bin/aws) \
  || { warn "The AWS command-line tool isn't installed (VOICE-SETUP.md step 2)."; exit 1; }
PY=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1 && "$c" --version >/dev/null 2>&1; then PY="$c"; break; fi
done
[[ -n "$PY" ]] || { warn "Python 3 isn't installed; Martha needs it."; exit 1; }
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
aws_text() { "$AWS" "$@" --output text | tr -d '\r'; }

# What voice-setup.sh remembered: the skill id and the budget email (never a secret).
[[ -f "$ENV_FILE" ]] || { warn "No $ENV_FILE: run voice-setup.sh first (VOICE-SETUP.md step 2)."; exit 1; }
SKILL_ID=$(grep -m1 '^SKILL_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)
BUDGET_EMAIL=$(grep -m1 '^BUDGET_EMAIL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)
[[ -n "$SKILL_ID" && -n "$BUDGET_EMAIL" ]] \
  || { warn "$ENV_FILE is missing the skill id or budget email: run voice-setup.sh again."; exit 1; }

printf '\n  Martha voice notes: a new %s key\n\n' "$LABEL"
if ! "$AWS" sts get-caller-identity >/dev/null 2>&1; then
  say "Signing this computer in to AWS. A browser window opens."
  "$AWS" login || { warn "The sign-in didn't finish. Run this again when you're ready."; exit 1; }
fi

# The region the build lives in: the one set before running, else the first that has the stack.
if [[ -z "${AWS_DEFAULT_REGION:-}" ]]; then
  for r in us-east-2 us-east-1 us-west-2 us-west-1 ca-central-1 eu-west-1 eu-west-2 eu-central-1 \
           ap-southeast-2 ap-northeast-1 ap-south-1 sa-east-1; do
    if "$AWS" cloudformation describe-stacks --stack-name "$STACK" --region "$r" >/dev/null 2>&1; then
      export AWS_DEFAULT_REGION="$r"; break
    fi
  done
fi
[[ -n "${AWS_DEFAULT_REGION:-}" ]] || { warn "No Martha build found in any region: run voice-setup.sh first."; exit 1; }

say "1/4 Updating the build in ${AWS_DEFAULT_REGION}..."
if ! "$AWS" cloudformation deploy --stack-name "$STACK" \
     --template-file "$(winpath "$ROOT/alexa/infra/martha-voice.yaml")" \
     --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
     --parameter-overrides "AlexaSkillId=$SKILL_ID" "BudgetEmail=$BUDGET_EMAIL" >/dev/null; then
  warn "AWS couldn't update the build. What it said:"
  aws_text cloudformation describe-stack-events --stack-name "$STACK" \
    --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" | head -n 8
  exit 1
fi
TABLE=$(aws_text cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue")
[[ -n "$TABLE" ]] || { warn "The build doesn't name its notes table. Run voice-setup.sh again."; exit 1; }

say "2/4 Asking AWS's policy simulator what $KEY_USER may do..."
USER_ARN=$(aws_text iam get-user --user-name "$KEY_USER" --query User.Arn)
TABLE_ARN=$(aws_text dynamodb describe-table --table-name "$TABLE" --query Table.TableArn)
# The simulator has to be told the region and which items a call touches. Without the region, an
# account whose organization allows one region only (AWS's newer "project" accounts) comes back
# denied for everything (2026-11-19). Each kind of item is asked about separately.
simulate() {
  aws_text iam simulate-principal-policy --policy-source-arn "$USER_ARN" \
    --action-names dynamodb:Query dynamodb:GetItem dynamodb:DeleteItem dynamodb:PutItem dynamodb:UpdateItem dynamodb:Scan dynamodb:DeleteTable \
    --resource-arns "$TABLE_ARN" \
    --context-entries "ContextKeyName=aws:RequestedRegion,ContextKeyValues=$AWS_DEFAULT_REGION,ContextKeyType=string" \
                      "ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=$1,ContextKeyType=stringList" \
    --query 'EvaluationResults[].[EvalActionName,EvalDecision]' | awk -v k="$1" 'NF{print $1 "@" k "\t" $2}'
}
verdicts=$(simulate note; simulate context; simulate household)
printf '%s\n' "$verdicts" | sed 's/^/      /'
allowed=$(printf '%s\n' "$verdicts" | awk '$2=="allowed"{print $1}' | LC_ALL=C sort)
ALLOWED_WANT=$(printf '%s\n' "$ALLOWED_WANT" | LC_ALL=C sort)
if [[ "$allowed" != "$ALLOWED_WANT" ]]; then
  warn "$KEY_USER may do something other than what it should. No key was made."
  exit 1
fi
say "That is exactly what it should be allowed."

say "3/4 Making the key (never shown)..."
OLD_KEYS=$(aws_text iam list-access-keys --user-name "$KEY_USER" --query 'AccessKeyMetadata[].AccessKeyId')
if [[ $(printf '%s' "$OLD_KEYS" | wc -w) -ge 2 ]]; then
  warn "$KEY_USER already has two keys, the most AWS allows. In the AWS console, open"
  warn "IAM > Users > $KEY_USER > Security credentials, delete the older key, then run this again."
  exit 1
fi
read -r MARTHA_VOICE_KEY_ID MARTHA_VOICE_SECRET < <(aws_text iam create-access-key --user-name "$KEY_USER" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]')
[[ -n "${MARTHA_VOICE_SECRET:-}" ]] || { warn "AWS didn't make the key. Run this again."; exit 1; }
MARTHA_VOICE_REGION="$AWS_DEFAULT_REGION"; MARTHA_VOICE_TABLE="$TABLE"
export MARTHA_VOICE_KEY_ID MARTHA_VOICE_SECRET MARTHA_VOICE_REGION MARTHA_VOICE_TABLE
if [[ "$WHO" == phone ]]; then
  mkdir -p "$PHONE_DIR"
  export MARTHA_VOICE_READ_ONLY=1 MARTHA_VOICE_CREDS="$(winpath "$PHONE_DIR/voice-credentials.json")"
elif [[ "$WHO" == computer2 ]]; then
  # Its own folder, so it can never land on top of this computer's key file.
  mkdir -p "$SECOND_DIR"
  unset MARTHA_VOICE_READ_ONLY
  export MARTHA_VOICE_CREDS="$(winpath "$SECOND_DIR/voice-credentials.json")"
else
  # The computer's file is wherever martha_voice.py finds it (or the profile folder): replaced in place.
  unset MARTHA_VOICE_READ_ONLY MARTHA_VOICE_CREDS
fi
if [[ "$WHO" != phone && -z "${MARTHA_VOICE_PERSON:-}" ]]; then
  # Shown in the shared household's who-changed-what log. Not a secret; Enter skips each.
  read -r -p "  First name of the person who uses that computer (Enter to skip): " MARTHA_VOICE_PERSON || true
  read -r -p "  A name for the computer, such as 'the kitchen PC' (Enter to skip): " MARTHA_VOICE_DEVICE || true
  export MARTHA_VOICE_PERSON MARTHA_VOICE_DEVICE
fi
say "Waiting 15 seconds for AWS to switch the new key on..."
sleep 15

say "4/4 Saving the key file and checking it with AWS..."
if ! "$PY" "$(winpath "$SCRIPTS/martha_voice.py")" setup --from-env; then
  unset MARTHA_VOICE_KEY_ID MARTHA_VOICE_SECRET
  warn "The key file is saved but the check failed; the message above says why."
  exit 1
fi
NEW_KEY="$MARTHA_VOICE_KEY_ID"
unset MARTHA_VOICE_KEY_ID MARTHA_VOICE_SECRET

if [[ "$WHO" == computer && -n "$OLD_KEYS" ]]; then
  printf '\n'
  say "This computer's older key is no longer in its file, so nothing here can use it."
  read -r -p "  Delete it in AWS now? [y/N] " reply
  if [[ "$reply" =~ ^[Yy] ]]; then
    for k in $OLD_KEYS; do
      [[ "$k" == "$NEW_KEY" ]] && continue
      "$AWS" iam delete-access-key --user-name "$KEY_USER" --access-key-id "$k" && say "Deleted the older key."
    done
  else
    say "Kept. It can be deleted later in IAM > Users > $KEY_USER > Security credentials."
  fi
fi

printf '\n'
if [[ "$WHO" == phone ]]; then
  say "Done. The phone key is in: $(winpath "$PHONE_DIR/voice-credentials.json")"
  say "It can read notes and the shared household, and change nothing. VOICE-SETUP.md, 'Reading"
  say "notes from a phone', says how to give it to your phone's Claude, and how to cancel it."
elif [[ "$WHO" == computer2 ]]; then
  say "Done. The second computer's key is in: $(winpath "$SECOND_DIR/voice-credentials.json")"
  say "Carry that one file to the other computer yourself (a USB stick or your own file sharing,"
  say "never email or a chat), put it in that computer's profile folder, then delete it here."
  say "VOICE-SETUP.md, 'A second computer', has the rest, and how to cancel the key."
else
  say "Done. This computer reads Martha's notes again."
fi

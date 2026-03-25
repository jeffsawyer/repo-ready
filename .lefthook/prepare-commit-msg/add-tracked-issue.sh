#!/bin/bash
COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2
SHA1=$3

# Inspects branch name and checks if it contains a Jira ticket number (e.g. ABC-123).
# If yes, commit message will be automatically appended with [ABC-123].
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ ! -z "$BRANCH_NAME" ] && [ "$BRANCH_NAME" != "HEAD" ] && [ "$SKIP_PREPARE_COMMIT_MSG" != 1 ]; then
    JIRA_ISSUE_PATTERN='[A-Z]{2,5}-[0-9]{1,4}'
    [[ $BRANCH_NAME =~ $JIRA_ISSUE_PATTERN ]]
    JIRA_ISSUE=${BASH_REMATCH[0]}
    JIRA_ISSUE_IN_COMMIT=$(grep -c "\[$JIRA_ISSUE\]" $COMMIT_MSG_FILE)

    if [[ -n "$JIRA_ISSUE" ]] && ! [[ $JIRA_ISSUE_IN_COMMIT -ge 1 ]]; then
        sed -i.bak -e "1s,$, [$JIRA_ISSUE]," $COMMIT_MSG_FILE
    fi
fi

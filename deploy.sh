#!/bin/bash
# Author: Satish Gaikwad

#
# Variables
#

ENV=$1
ACTION=$2
VALID_ENV_NAMES="dev|qa|stg|uat|pp|prod"
VALID_ACTIONS="deploy|rm"
DOMAIN=satishweb.com
# For letsencrypt auto route53 dns based challenge please export below vars before running this script
# export AWS_ACCESS_KEY_ID=
# export AWS_SECRET_ACCESS_KEY=
# export AWS_REGION=
# export AWS_HOSTED_ZONE_ID=
#
# Policy for AWS
# {
#     "Version": "2012-10-17",
#     "Statement": [
#         {
#             "Effect": "Allow",
#             "Action": [
#                 "route53:*"
#             ],
#             "Resource": [
#                 "*"
#             ]
#         }
#     ]
# }
# Test this using aws command. You can set more restrictive policy than allowing all access on route53

#
# Functions
#

usage() {
	echo "ERR: $1"
	echo "Usage: $0 <$VALID_ENV_NAMES> <$VALID_ACTIONS>"
        exit 1
}

#
# Validations
#

if [[ ! "$ENV" =~ ^($VALID_ENV_NAMES)$ ]]; then
	usage "Valid ENV name is required"
fi
if [[ ! "$ACTION" =~ ^($VALID_ACTIONS)$ ]]; then
	usage "Valid ACTION is required"
fi

[[ ! $AWS_ACCESS_KEY_ID ]] && echo "WARN: AWS_ACCESS_KEY_ID variable is not set"
[[ ! $AWS_SECRET_ACCESS_KEY ]] && echo "WARN: AWS_SECRET_ACCESS_KEY variable is not set"
[[ ! $AWS_REGION ]] && echo "WARN: AWS_REGION variable is not set"
[[ ! $AWS_HOSTED_ZONE_ID ]] && echo "WARN: AWS_HOSTED_ZONE_ID variable is not set"

#
# Execution
#

if [[ "$ACTION" == "rm" ]]; then
        docker stack rm $ENV
elif [[ "$ACTION" == "deploy" ]]; then
        docker stack deploy -c docker-*.yml $ENV
fi

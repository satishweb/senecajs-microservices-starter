#!/bin/bash
# Author: Satish Gaikwad

srcFolder=$(dirname "${BASH_SOURCE[0]}")
cd $srcFolder
srcFolder=`pwd`

#
# Variables
#

export ENV=$1
export ACTION=$2
VALID_ENV_NAMES="dev|qa|stg|uat|pp|prod"
VALID_ACTIONS="deploy|rm"
DNS_UPDATE=1

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

[[ ! "$DOMAIN" == "" ]] && echo "ERR: DOMAIN variable is not declared!" && exit 1
[[ ! "$SUBDOMAIN" == "" ]] && echo "ERR: SUBDOMAIN variable is not declared!" && exit 1
[[ ! "$ENV" =~ ^($VALID_ENV_NAMES)$ ]] && usage "Valid ENV name is required"
[[ ! "$ACTION" =~ ^($VALID_ACTIONS)$ ]] && usage "Valid ACTION is required"
[[ ! $AWS_ACCESS_KEY_ID ]] && echo "WARN: AWS_ACCESS_KEY_ID variable is not set" && DNS_UPDATE=0
[[ ! $AWS_SECRET_ACCESS_KEY ]] && echo "WARN: AWS_SECRET_ACCESS_KEY variable is not set" && DNS_UPDATE=0
[[ ! $AWS_REGION ]] && echo "WARN: AWS_REGION variable is not set" && DNS_UPDATE=0
[[ ! $AWS_HOSTED_ZONE_ID ]] && echo "WARN: AWS_HOSTED_ZONE_ID variable is not set" && DNS_UPDATE=0

if [[ ! -f $(which envsubst) ]]
	then
	echo "| ERR: On MacOSX, please install envsubst command using below commands (non root shell/terminal/iterm):"
	echo "| 	wget http://ftp.gnu.org/gnu/gettext/gettext-0.19.8.tar.gz -O gettext.tar.gz; tar -zxf gettext.tar.gz; cd gettext-*; "
	echo "| 	./configure; make -j8; sudo make install"
	exit 2
fi

#
# Execution
#

if [[ "$ACTION" == "rm" ]]; then
    docker stack rm $ENV
elif [[ "$ACTION" == "deploy" ]]; then
	docker run -v "$srcFolder:/src" -w "/src" --rm -it node:8 bash -c "npm install --production --no-optional 2>&1" 2>&1|sed 's/^/| NPM: /'
	[[ -f apidocs/src/build.sh ]] && echo "| INFO: Clean apidocs yaml collection..." && apidocs/src/build.sh clean|sed 's/^/| APIDocs: /'
	envsubst < docker-*.yml > ".local-docker-stack.yml"
	envsubst < docs/mkdocs-source.yml > "docs/mkdocs.yml"
	docker run --rm -it -v `pwd`/docs:/docs squidfunk/mkdocs-material build
    docker stack deploy -c .local-docker-stack.yml $ENV
fi

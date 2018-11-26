#!/bin/bash
# Author: Satish Gaikwad <satish@satishweb.com>

VALID_DNS_RECORD_TYPES="A|CNAME" # Supported DNS records
DEFAULT_TTL='300' # Default TTL value for DNS records

#
# Functions
#

function usage() {
	echo ""
	echo "| ERR: $1"
	echo "-----------------------------------------------------------------------------------------------------------------------------------"
	echo "| Usage: $0 -s|--subdomain <SUBDOMAIN> -d|--domain <PARENT_DOMAIN> -r|--record <Name:Type:Value1,Value2:TTL>"
	echo "|   SUBDOMAIN (Optional) :  SUBDOMAIN without FQDN"
	echo "|                           DOMAIN will be used for records creation if subdomain is not provided"
	echo "|                           If subdomain zone is not created, script will create and set it up for you"
	echo "|   DOMAIN               :  DOMAIN in FQDN format"
	echo "|   RECORD               :  DNS record in format: 'Name:Type:Value'"
	echo "|                           (You can provide multiple inputs of -r input type)"
	echo "|     Name               :  Alphanumeric only"
	echo "|     Type Values        :  $VALID_DNS_RECORD_TYPES"
	echo "|     Value              :  Valid IP for record type A and non IP, alphanumeric and FQDN for CNAME"
	echo "|     TTL (Optional)     :  Time To Live value in seconds for record. (Default is 300 seconds)"
	echo "|   Required Commands    :  aws, jq"
	echo "|   Required Variables   :  DOMAIN, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_HOSTED_ZONE_ID"
	echo "|   Note                 :  Please test route53 access using aws cli to confirm that given key can update or create DNS records"
	echo "|   Example              :  $0 -s test -d google.com -r 'api:A:1.1.1.1:300' -r 'docs:A:2.2.2.2,3.3.3.3:60'"
	echo "-----------------------------------------------------------------------------------------------------------------------------------"
    exit 1
}

function checkIP() {
    local  IP=$1

    if [[ $IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        OIFS=$IFS
        IFS='.'
        IP=($IP)
        IFS=$OIFS
        [[ ${IP[0]} -le 255 && ${IP[1]} -le 255 && ${IP[2]} -le 255 && ${IP[3]} -le 255 ]]
		echo $?
    else
		echo 1
	fi	
}

function cleanup() {
	rm -rf $ZONE_FILE $TMPL_ZONE_FILE >/dev/null 2>&1
}

#
# Basic Validations
#

[[ ! $(which aws) ]] && usage "ERR: aws command is not in the path or aws cli is not installed"
[[ ! $(which jq) ]] && usage "ERR: jq command is not in the path or jq is not installed"
[[ "$1" == "" ]] && usage "Missing parameters"


#
# Process input params
#
RECORDS_DATA='{
"Comment": "Create a DNS records in the domain",
"Changes": []
}'
export DOMAIN=
export SUBDOMAIN=
RECORDS_VIEW=

while [ "$1" != "" ]; do
    case $1 in
        -s | --subdomain )
			shift
            export SUBDOMAIN=$1
			[[ "$SUBDOMAIN" == *.* ]] && usage "Subdomain can not be a FQDN"
            ;;
        -d | --domain )
			shift
            export DOMAIN=$1
			[[ ! "$DOMAIN" == *.* && "$i" =~ [^a-zA-Z0-9.] ]] && usage "Domain must be a valid FQDN. e.g. google.com"
            ;;
        -r | --record )
			shift
			RECORDS_VIEW+="#$1" #We will use for display purpose
			export TMP_DNSNAME=$(echo $1|awk -F ':' '{print $1}')
			[[ "$TMP_DNSNAME" =~ [^a-zA-Z0-9] ]] && usage "DNS Name - \"$TMP_DNSNAME\": must be alphanumeric."
			export TMP_RECORD_TYPE=$(echo $1|awk -F ':' '{print $2}')
			[[ ! "$TMP_RECORD_TYPE" =~ ^($VALID_DNS_RECORD_TYPES)$ ]] && usage "DNS Record Type - \"$TMP_RECORD_TYPE\": is invalid. Valid Record types are - $VALID_DNS_RECORD_TYPES"
			export TMP_VALUE="$(echo $1|awk -F ':' '{print $3}')"
			# Lets validate values
			for i in $(echo $TMP_VALUE|sed 's/,/ /g')
			do
				if [[ "$(checkIP $i)" != "0" && "$TMP_RECORD_TYPE" == "A" ]]; then
					usage "DNS Record Value - $i: is not a valid IP for host record type $TMP_RECORD_TYPE"
				elif [[  "$i" =~ [^a-zA-Z0-9.] || "$i" != *.* && "$TMP_RECORD_TYPE" == "CNAME" ]]; then
					usage "DNS record value - $i: is not a valid FQDN value for host record type $TMP_RECORD_TYPE"
				fi
			done
			# Check if we have comma separated multiple values for DNS record
			if [[ "$TMP_VALUE" == *,* ]]; then
				# Set value of TMP_VALUE variable with quotes and comma so that we can directly use it in jq command
				export VALUE_DATA="$(echo $TMP_VALUE|sed 's/^/{"Value":"/; s/,/"},{"Value":"/g; s/$/"}/')"
			else
				export VALUE_DATA="$(echo $TMP_VALUE|sed 's/^/{"Value":"/;s/$/"}/')"
			fi
			export TMP_TTL=$(echo $1|awk -F ':' '{print $4}')
			if [[ "$TMP_TTL" == "" ]]; then
				export TMP_TTL=$DEFAULT_TTL
			else
				[[ "$TMP_TTL" =~ [^0-9] ]] && echo "| WARN: TTL - $TMP_TTL: is not valid number, using default value" && export TMP_TTL=$DEFAULT_TTL
			fi
			# Lets update the records data 
			RECORDS_DATA=$(jq ".Changes += [{
				\"Action\": \"UPSERT\",
				\"ResourceRecordSet\": {
					\"Name\": \"${TMP_DNSNAME}.SETME_DOMAIN\",
					\"Type\":\"${TMP_RECORD_TYPE}\",
					\"TTL\": ${TMP_TTL},
					\"ResourceRecords\": [
						${VALUE_DATA}
					]
				}
			}]" <<<"$RECORDS_DATA")
            ;;
        -h | --help )
			usage
            exit
            ;;
        * )
			usage
            exit 1
    esac
    shift
done

#
# Variables
#

TMPL_ZONE_FILE=.update-zone.template.json
ZONE_FILE=.update-zone.json

# For route53 dns update please export below vars before running this script
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
# Validations
#
[[ ! $DOMAIN ]] && usage "DOMAIN is missing"
[[ ! $AWS_ACCESS_KEY_ID ]] && usage "AWS_ACCESS_KEY_ID variable is not set"
[[ ! $AWS_ACCESS_KEY_ID ]] && usage "AWS_ACCESS_KEY_ID variable is not set"
[[ ! $AWS_SECRET_ACCESS_KEY ]] && usage "AWS_SECRET_ACCESS_KEY variable is not set"
[[ ! $AWS_REGION ]] && usage "AWS_REGION variable is not set"
[[ ! $AWS_HOSTED_ZONE_ID ]] && usage "AWS_HOSTED_ZONE_ID variable is not set"
if [[ "$SUBDOMAIN" != "" ]]; then
	SUBDOMAIN_ZONE_ID=$(aws route53 list-hosted-zones --output=json| jq -r ".HostedZones[]|select(.Name==\"${SUBDOMAIN}.${DOMAIN}.\")|.Id"|sed 's/\/hostedzone\///')
	ZONE_DOMAIN="$SUBDOMAIN.$DOMAIN"
else
	echo "| WARN: SUBDOMAIN is not provided. Using parent DOMAIN for creating/updating records."
	SUBDOMAIN_ZONE_ID=
	ZONE_DOMAIN="$DOMAIN"
fi
PARENT_ZONE_ID=$(aws route53 list-hosted-zones --output=json| jq -r ".HostedZones[]|select(.Name==\"${DOMAIN}.\")|.Id"|sed 's/\/hostedzone\///')
[[ "$PARENT_ZONE_ID" == "" ]] && usage "No valid zone found for $DOMAIN, please check Route53. Incorrect permissions or zone does not exists"

#
# Execution
#

# create the hosted zone for the subdomain if does not exists
if [[ "$SUBDOMAIN_ZONE_ID" != "" ]]; then
	echo "| INFO: $SUBDOMAIN.$DOMAIN zone was already created, Zone ID: $SUBDOMAIN_ZONE_ID"
	# Lets validate if this was not a result of partial domain setup
	# TODO: Fetch Subdomain NS records from parent domain and validate.
elif [[ "$SUBDOMAIN" != "" ]]; then
	echo "| INFO: $SUBDOMAIN.$DOMAIN zone not found, creating..."
	aws route53 create-hosted-zone --name "${SUBDOMAIN}.${DOMAIN}" --caller-reference "$SUBDOMAIN.$DOMAIN-$(uuidgen)" --output=json>/dev/null 2>&1
	if [[ "$?" != "0" ]]; then
		echo "| ERR: Creating hosted zone for $SUBDOMAIN.$DOMAIN failed. Please fix it manually"
		exit 2
	fi
	SUBDOMAIN_ZONE_ID=$(aws route53 list-hosted-zones --output=json| jq -r ".HostedZones[]|select(.Name == \"${SUBDOMAIN}.${DOMAIN}.\")|.Id")
	echo "| INFO: $SUBDOMAIN.$DOMAIN zone created successfully, Zone ID: $SUBDOMAIN_ZONE_ID"

	# create a changeset template
	echo "| INFO: Setting up NS records of newly created zone for delegation in parent zone $DOMAIN..."
	# Create Update zone template
	echo '{
	"Comment": "Create a subdomain NS record in the parent domain",
	"Changes": [{
		"Action": "UPSERT",
		"ResourceRecordSet": {
		"Name": "",
		"Type": "NS",
		"TTL": 300,
		"ResourceRecords": []
		}
	}]
	}' > $TMPL_ZONE_FILE
	# generate the changeset for the parent zone
	cat $TMPL_ZONE_FILE \
	| jq ".Changes[].ResourceRecordSet.Name=\"${SUBDOMAIN}.${DOMAIN}.\"" \
	| jq ".Changes[].ResourceRecordSet.ResourceRecords=$(aws route53 get-hosted-zone --id ${SUBDOMAIN_ZONE_ID} --output=json| jq ".DelegationSet.NameServers|[{\"Value\": .[]}]")" > $ZONE_FILE

	# create a NS record for the subdomain in the parent zone
	aws route53 change-resource-record-sets --output=json\
	--hosted-zone-id $PARENT_ZONE_ID \
	--change-batch file://$ZONE_FILE >/dev/null 2>&1
	if [[ "$?" != "0" ]]; then
		echo "| ERR: Creating NS records for $SUBDOMAIN.$DOMAIN at parent domain zone $DOMAIN failed. Please fix it manually"
		cleanup
		exit 2
	fi
fi

[[ "$SUBDOMAIN" == "" ]] && ZONE_ID=$PARENT_ZONE_ID || ZONE_ID=$SUBDOMAIN_ZONE_ID

# Now lets create the DNS record for given DNSNAME
echo $RECORDS_DATA | sed "s/SETME_DOMAIN/$ZONE_DOMAIN/g" > $ZONE_FILE
aws route53 change-resource-record-sets --output=json\
	--hosted-zone-id $ZONE_ID \
	--change-batch file://$ZONE_FILE >/dev/null 2<&1
if [[ "$?" != "0" ]]; then
	echo "| ERR: Creating DNS records for $SUBDOMAIN.$DOMAIN failed. Please fix it manually"
	cleanup
	exit 2
else
	echo "| INFO: Successfully submitted request to create below records"
	echo " ---------------------------------------------------------------------------------------------------"
	printf " | %-50s | %-10s | %-40s\n " DNS\ Name Type Value
	for i in $(echo $RECORDS_VIEW|sed 's/#/ /g')
	do
		printf "| %-50s | %-10s | %-40s\n " $(echo `echo $i|awk -F '[:]' '{ print $1 }'`.$ZONE_DOMAIN) $(echo $i|awk -F '[:]' '{ print $2 }') $(echo $i|awk -F '[:]' '{ print $3 }')
	done
	echo "----------------------------------------------------------------------------------------------------"
fi
cleanup

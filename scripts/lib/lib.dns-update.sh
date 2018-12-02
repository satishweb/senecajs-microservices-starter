## vim:ts=4:sw=4:tw=200:nu:ai:nowrap:
##
## Author: Satish Gaikwad
##
## Application library

##
## application initialization function
##

function __init() {

	##
	## Process input params
	##
	while [ "${1}" != "" ]; do
		case ${1} in
			-d | --domain )
				shift
				__msg debug "Processing input parameter: -d ${1}"
				export Domain=${1}
				[[ ! "${Domain}" == *.* ]] && __usage "Domain must be a FQDN"
				export ParentDomain=$(echo ${Domain}|awk -F '[.]' '{print $(NF-1)"."$NF}')
				[[ ! "${ParentDomain}" == *.* ]] && __usage "Generated Parent Domain value from given domain does not contain FQDN value. Unknown error"
				# Lets set ParentDomain to null if given domain is not a subdomain.
				[[ "${ParentDomain}" == "${Domain}" ]] && export ParentDomain=
				__msg debug "Domain is ${Domain} and ParentDomain is ${ParentDomain}"
				;;
			-r | --record )
				shift
				__msg debug "Processing input parameter: -r ${1}"
				export RecordsView+="#${1}" #We will use for display purpose
				local tmpDnsName=$(echo ${1}|awk -F ':' '{print $1}')
				[[ "${tmpDnsName}" =~ [^a-zA-Z0-9-] ]] && __usage "DNS Name - \"${tmpDnsName}\": must be alphanumeric."
				local tmpRecordType=$(echo ${1}|awk -F ':' '{print $2}')
				[[ ! "${tmpRecordType}" =~ ^(${ValidDnsRecordTypes})$ ]] && __usage "DNS Record Type - \"${tmpRecordType}\": is invalid. Valid Record types are - ${ValidDnsRecordTypes}"
				local tmpValue="$(echo ${1}|awk -F ':' '{print $3}')"
				__msg debug "Inpute value ${1} is validated"
				# Lets validate values
				for i in $(echo ${tmpValue}|sed 's/,/ /g')
				do
					[[ "${IpCheck}" != "1" ]] && badIp=0 || badIp=$(checkIp ${i})
					if [[ "$badIp" != "0" && "${tmpRecordType}" == "A" ]]; then
						__usage "DNS Record Value - ${i}: is not a valid IP for host record type ${tmpRecordType}"
					elif [[  "${i}" =~ [^a-zA-Z0-9.-] || "${i}" != *.* && "${tmpRecordType}" == "CNAME" ]]; then
						__usage "DNS record value - ${i}: is not a valid FQDN value for host record type ${tmpRecordType}"
					fi
					__msg debug "Record: ${tmpDnsName} Record Type: ${tmpRecordType} Value Set $tmpValue: validated DNS record Value: $i"
				done
				# Check if we have comma separated multiple values for DNS record
				if [[ "${tmpValue}" == *,* ]]; then
					# Set value of tmpValue variable with quotes and comma so that we can directly use it in jq command
					local valueData="$(echo ${tmpValue}|sed 's/^/{"Value":"/; s/,/"},{"Value":"/g; s/$/"}/')"
				else
					local valueData="$(echo ${tmpValue}|sed 's/^/{"Value":"/;s/$/"}/')"
				fi
				local tmpTtl=$(echo ${1}|awk -F ':' '{print $4}')
				if [[ "${tmpTtl}" == "" ]]; then
					local tmpTtl=${DefaultDnsTtl}
				else
					[[ "${tmpTtl}" =~ [^0-9] ]] && __msg warn "TTL - ${tmpTtl}: is not valid number, using default value" && tmpTtl=${DefaultDnsTtl}
				fi
				# Lets update the records data 
				export RecordsData=$(jq ".Changes += [{
					\"Action\": \"UPSERT\",
					\"ResourceRecordSet\": {
						\"Name\": \"${tmpDnsName}.SETME_DOMAIN\",
						\"Type\":\"${tmpRecordType}\",
						\"TTL\": ${tmpTtl},
						\"ResourceRecords\": [
							${valueData}
						]
					}
				}]" <<<"$RecordsData")
				__msg debug "Processed input parameter value successfully: ${1}"
				;;
			--no-zone-check )
				__msg debug "Processing input parameter: --no-zone-check"
				export ZoneCheck=0
				if [[ "${AWS_HOSTED_ZONE_ID}" == "" ]]; then
					__usage "Zone check is disabled and variable AWS_HOSTED_ZONE_ID is not set. Please remove -n|--no-zone-check from command parameters or export AWS_HOSTED_ZONE_ID variable with correct zone ID"
				fi
				;;
			--no-ip-check )
				__msg debug "Processing input parameter: --no-ip-check"
				export IpCheck=0
				;;
			-h | --help )
				__msg debug "Processing input parameter: -h"
				usage
				exit
				;;
			* )
				__msg debug "Processing input parameter: none"
				__usage "Invalid parameters"
				exit 1
		esac
		shift
	done

	##
	## Validations
	##
	__msg debug "Validation begins"
	[[ ! ${Domain} ]] && __usage "Domain is missing"
	__msg debug "Domain is validated and its value is: ${Domain}"
	[[ ! ${AWS_ACCESS_KEY_ID} ]] && __usage "AWS_ACCESS_KEY_ID variable is not set"
	__msg debug "AWS_ACCESS_KEY_ID is validated and its value is: ${AWS_ACCESS_KEY_ID}"
	[[ ! ${AWS_SECRET_ACCESS_KEY} ]] && __usage "AWS_SECRET_ACCESS_KEY variable is not set"
	__msg debug "AWS_SECRET_ACCESS_KEY is validated and its value is: XXXXXXXXXXXXX"
	[[ ! ${AWS_REGION} ]] && export AWS_REGION=us-east-1 && __msg debug "AWS_REGION is set to us-east-1 as default value"
	__msg debug "AWS_REGION is validated and its value is: ${AWS_REGION}"
	[[ "${RecordsView}" == "" ]] && __usage "Records are not provided"
	__msg debug "Records validated and its value is: ${RecordsView}"
	return 0 # success
}

##
## application main function
##

function __main() {
	## Lets set correct ZoneId based on variables or by fetching IDs from AWS R53 service
	# Lets create subdomain zone if it does not exists and zone check is enabled.
	if [[ "${ZoneCheck}" == "1" ]]; then
		__msg debug "ZoneCheck is forced"
		if [[ "${ParentDomain}" != "" ]]; then
			__msg info "Getting Parent Domain zone ID for ${ParentDomain} from AWS R53 Service"
			getZoneId ${ParentDomain} "soft" # Returns TmpZoneId
			export ParentZoneId=${TmpZoneId}
			if [[ "${ParentZoneId}" == "" ]]; then
				__msg warn "Could not retrieve parent Zone ID, ignoring NS record creation/update/check for ${Domain}"
			else
				__msg info "Successfully retrieved Parent domain zone ID for ${ParentDomain}. Zone ID: ${ParentZoneId}"
			fi
		else
			__msg info "${Domain} does not require any NS records update/creation in its parent domain zone."
			__msg info "If DNS records do not get resolved correctly, you might need to set/check ${Domain} NS records manually at your domain registrar."
		fi
		__msg info "Fetching domain zone ID for ${Domain} from AWS R53 service..."
		getZoneId ${Domain} "soft" # Returns TmpZoneId
		export DomainZoneId=${TmpZoneId}
		if [[ "${DomainZoneId}" == "" ]]; then
			# We could not fetch the zone, lets try creating it
			__msg info "We could not get domain zone ID from AWS R53 service for ${Domain}..."
			createHostedZone "${Domain}" # returns DomainZoneId for newly created domain
		fi
		if [[ "${DomainZoneId}" == "" && "${AWS_HOSTED_ZONE_ID}" != "" ]]; then
			__msg warn "Could not fetch the Zone ID of ${Domain}, assuming AWS_HOSTED_ZONE_ID to be correct value..."
			export DomainZoneId=${AWS_HOSTED_ZONE_ID}
		fi
	else
		__msg debug "ZoneCheck is ignored and AWS_HOSTED_ZONE_ID is set to: ${AWS_HOSTED_ZONE_ID}"
		if [[ "${AWS_HOSTED_ZONE_ID}" == "" ]]; then
			__usage "Zone check is disabled and AWS_HOSTED_ZONE_ID is missing. I need either."
		else
			export DomainZoneId=${AWS_HOSTED_ZONE_ID}
		fi
	fi
	
	if [[ "${ParentDomain}" != "" && "${ParentZoneId}" != "" && "${ZoneCheck}" == "1" ]]; then
		createNsRecords "${Domain}" "${ParentDomain}" "${DomainZoneId}" "${ParentZoneId}"
	fi
	createDnsRecords "${Domain}" "${DomainZoneId}" "${RecordsData}"
	__msg info "Successfully submitted request to create below records"
	__msg info " ---------------------------------------------------------------------------------------------------"
	__msg info "$(printf " | %-50s | %-10s | %-40s\n " DNS\ Name Type Value)"
	for i in $(echo $RecordsView|sed 's/#/ /g')
	do
		local domain=$(echo `echo ${i}|awk -F '[:]' '{ print $1 }'`.${Domain})
		local recordType=$(echo ${i}|awk -F '[:]' '{ print $2 }')
		local value=$(echo ${i}|awk -F '[:]' '{ print $3 }')
		__msg info " $(printf "| %-50s | %-10s | %-40s\n " ${domain} ${recordType} ${value})"
	done
	__msg info " ----------------------------------------------------------------------------------------------------"
	return 0 # success
}

##
## application worker functions
##

function createHostedZone() {
	## ----- head -----
	##
	## DESCRIPTION:
	##   This function creates hosted R53 DNS Zone in AWS
	##
	## ARGUMENTS:
	##   domain (require) 			= FQDN value
	##
	local domain=${1}
	## create the hosted zone for the Domain if does not exists
	__msg info "Creating ${domain} zone in AWS R53 service..."
	aws route53 create-hosted-zone --name "${domain}" --caller-reference "${domain}-$(uuidgen)" --output=json >/dev/null 2>&1
	if [[ "$?" != "0" ]]; then
		__msg err "Creating hosted zone for ${domain} failed. Please fix it manually"
		__die 2
	fi
	getZoneId ${domain} "soft" # Returns TmpZoneId
	export DomainZoneId=${TmpZoneId}
	if [[ "${DomainZoneId}" == "" ]]; then
		__msg err "Could not create/fetch zone using AWS R53 service for ${domain}, please check Route53. Possible cause - incorrect permissions"
		__die 2
	else
		__msg info "${domain} zone created successfully, Zone ID: ${DomainZoneId}"
		__msg warn "Please check for duplicate zones. AWS allows multiple zone creation for same domains."

	fi
	return 0 # Success
}

function getZoneId() {
	## ----- head -----
	##
	## DESCRIPTION:
	##   This function retrieves Zone ID of given domain from AWS R53 service
	##
	## ARGUMENTS:
	##   domain (require) 			= Domain FQDN value
	##	 errorCheck					= hard|soft. Hard means exit if fails, soft means just return null. Default is hard
	##
	## This functions returns global variable TmpZodeId
	local domain=${1}
	local errorCheck=${2}
	[[ "${errorCheck}" == "" ]] && local errorCheck="hard"
	__msg debug "We are inside getZoneId function and input parameters are: domain: ${domain}, errorCheck: ${errorCheck}"
	__msg debug "Command is: aws route53 list-hosted-zones --output=json| jq -r \".HostedZones[]|select(.Name==\\\"${domain}.\\\")|.Id\"|sed 's/\\/hostedzone\\///'"
	export TmpZoneId=$(aws route53 list-hosted-zones --output=json| jq -r ".HostedZones[]|select(.Name==\"${domain}.\")|.Id"|sed 's/\/hostedzone\///'; local exitCode=${PIPESTATUS[0]})
	if [[ "${exitCode}" != "0" ]]; then
		[[ "${errorCheck}" == "hard" ]] && __die 3 "Could not get Domain Zone ID from AWS R53 service"
	fi
	__msg debug "getZoneId function is returning domain zone id as: $TmpZoneId"
	return 0
}

function createNsRecords() {
	## ----- head -----
	##
	## DESCRIPTION:
	##   This function creates NS records for given Domain zone into parent Zone
	##
	## ARGUMENTS:
	##   domain (require) 			= Domain FQDN value
	##	 parentDomain (require)		= Parent domain FQDN value
	##	 domainZoneId			 	= AWS R53 Zone ID for given domain
	##	 parentZoneId 				= AWS R53 Zone ID for given parent domain
	##
	## TODO: First check if NS records match with fetched ones rather overwriting NS records regardless
	local domain=${1}
	local parentDomain=${2}
	local domainZoneId=${3}
	local parentZoneId=${4}

	__msg info "Setting up NS records for $domain zone for delegation in parent zone $parentDomain..."
	# Create Update zone template
	echo '{
	"Comment": "Create a Domain NS record in the parent domain",
	"Changes": [{
		"Action": "UPSERT",
		"ResourceRecordSet": {
		"Name": "",
		"Type": "NS",
		"TTL": 300,
		"ResourceRecords": []
		}
	}]
	}' > ${TmplZoneFile}

	# Get domainZoneId if not provided.
	if [[ "${domainZoneId}" == "" ]]; then
		getZoneId ${domain} # Returns TmpZoneId
		local domainZoneId=${TmpZoneId}
	fi

	# generate the changeset for the parent zone
	cat ${TmplZoneFile} \
	| jq ".Changes[].ResourceRecordSet.Name=\"${domain}.\"" \
	| jq ".Changes[].ResourceRecordSet.ResourceRecords=$(aws route53 get-hosted-zone --id ${domainZoneId} --output=json| jq ".DelegationSet.NameServers|[{\"Value\": .[]}]")" > ${ZoneFile}

	# Lets get parentZoneId if not provided
	if [[ "${parentZoneId}" == "" ]]; then
		getZoneId ${domain} "soft" # Returns TmpZoneId
		local parentZoneId=${TmpZoneId}
		if [[ "${parentZoneId}" == "" ]]; then
			__msg warn "Could not get Parent Domain Zone ID from AWS R53 service, please set/check NS records manually (without this newly added DNS records may not work)"
		fi
	fi
	# create a NS record for the Domain in the parent zone
	if [[ "${parentZoneId}" != "" ]]; then
		aws route53 change-resource-record-sets --output=json --hosted-zone-id ${parentZoneId} --change-batch file://${ZoneFile} >/dev/null 2>&1
		if [[ "$?" != "0" ]]; then
			__msg warn "Creating NS records for ${domain} at parent domain zone ${parentDomain} failed. Please fix it manually"
		fi
	fi
}

function createDnsRecords() {
	## ----- head -----
	##
	## DESCRIPTION:
	##   This function creates DNS records in R53 DNS Zone in AWS
	##
	## ARGUMENTS:
	##   domain (require) 			= Domain FQDN value
	##	 domainZoneId (require)		= AWS R53 Zone ID for given domain
	##	 recordsData (require)		= DNS records data json in expected AWS R53 service format
	##
	## create DNS records in the given hosted zone
	local domain=${1}
	local domainZoneId=${2}
	local recordsData=${3}

	__msg debug "We are inside createDnsRecords function and input params are - domain:${domain}, domainZoneId:${domainZoneId}, recordsData: ${recordsData}"
	echo ${recordsData} | sed "s/SETME_DOMAIN/${domain}/g" > ${ZoneFile}
	[[ -f ${ZoneFile} ]] && __msg debug "Zone file is written at ${ZoneFile}" || __msg debug "Zone file writing at ${ZoneFile} failed"
	__msg debug "Command is: aws route53 change-resource-record-sets --output=json --hosted-zone-id ${domainZoneId} --change-batch file://${ZoneFile}"
	aws route53 change-resource-record-sets --output=json --hosted-zone-id ${domainZoneId} --change-batch file://${ZoneFile}>/dev/null 2>&1
	if [[ "$?" != "0" ]]; then
		__die 4 "Creating DNS records for ${domain} failed. Please fix it manually"
	fi
	return 0 # Success
}
function __usage() {
	__msg err "${1}"
	__msg info "┌-------------------------------------------------------------------------------------------------------------------------------------------------"
	__msg info "| Usage: $0 -d|--domain <domain> --no-zone-check --no-ip-check -r|--record <Name:Type:Value1,Value2:TTL>"
	__msg info "|"
	__msg info "| PARAMETERS:"
	__msg info "|   -d|--domain          :  Domain in FQDN format"
	__msg info "|   -r|--record          :  DNS record in format: 'Name:Type:Value' (You can provide multiple inputs of -r input type)"
	__msg info "|       Name             :  Only Alphanumerics and hyphen '-' allowed"
	__msg info "|       Type Values      :  ${ValidDnsRecordTypes}"
	__msg info "|       Value            :  Valid IP for record type A and non IP, alphanumeric and FQDN for CNAME"
	__msg info "|       TTL              :  Time To Live value in seconds for record. (Optional, default value is 300 seconds)"
	__msg info "|   --no-zone-check      :  Disabled checking given ZONEID"
	__msg info "|   --no-ip-check        :  Disabled checking given IP for DNS record"
	__msg info "|-------------------------------------------------------------------------------------------------------------------------------------------------"
	__msg info "|   Required Commands    :  aws, jq, checkIP (script)"
	__msg info "|   Required Variables   :  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_HOSTED_ZONE_ID (optional when --no-zone-check is not used)"
	__msg info "|   Note                 :  Please test route53 access using aws cli to confirm that given key can update or create DNS records"
	__msg info "|   Example              :  $0 -s test -d google.com -r 'api:A:1.1.1.1:300' -r 'docs:A:2.2.2.2,3.3.3.3:60'"
	__msg info "└-------------------------------------------------------------------------------------------------------------------------------------------------"
    __die 1 "We can not continue"
}

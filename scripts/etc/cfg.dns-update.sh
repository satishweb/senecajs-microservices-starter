## vim:ts=4:sw=4:tw=200:nu:ai:nowrap:
##
## Author: Satish Gaikwad
##
## DNS Update Settings
##

## Include shared config
__requireSource "${__ScriptPath}/etc/cfg.shared.sh"

## Application Variables

export RecordsData='{
	"Comment": "Create a DNS records in the Domain",
	"Changes": []
}'
export Domain=
export ValidDnsRecordTypes="A|CNAME" # Supported DNS records
export DefaultDnsTtl='300' # Default TTL value for DNS records
export RecordsView=
export ZoneCheck=1
export IpCheck=1
export TmplZoneFile=/tmp/.update-zone.template.json
export ZoneFile=/tmp/.update-zone.json

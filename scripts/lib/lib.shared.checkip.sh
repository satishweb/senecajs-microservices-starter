##!/bin/bash
## Author: Satish Gaikwad
##

## Functions

function checkIp() {
	## ----- head -----
	##
	## DESCRIPTION:
	##   This function Checks if inut IP is valid IP 
	##
	## ARGUMENTS:
	##   None
	##
	## create the hosted zone for the subdomain if does not exists
	if [[ ! ${IP}  && ${1} ]]; then
                local  IP=${1}
        elif [[ ! ${IP} && ! ${1} ]]; then
                __msg err "IP provided is null for function checkIp"
                echo 1
        fi
	if [[ ${IP} =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
	OIFS=${IFS}
	IFS='.'
	IP=(${IP})
	IFS=${OIFS}
	[[ "${IP[0]}" -le "255" && "${IP[1]}" -le "255" && "${IP[2]}" -le "255" && "${IP[3]}" -le "255" ]]
		echo $?
	else
		echo 1
	fi
}
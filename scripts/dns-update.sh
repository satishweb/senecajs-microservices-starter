#!/bin/bash
## vim:ts=4:sw=4:tw=200:nu:ai:nowrap:
##
## Author: Satish Gaikwad

##
## basic variables
##

export __ScriptFile=${0##*/}
export __ScriptName=${__ScriptFile%.sh}
export __ScriptPath=${0%/*}; __ScriptPath=${__ScriptPath%/}
export __ScriptHost=$(hostname -f)

##
## library and config
##

## system installation of bashinator (and application):
##
## accepting overrides[1] using user-defined environment variables:
export __BashinatorConfig="${__ScriptPath}/etc/cfg.bashinator.sh"
export __BashinatorLibrary="${__ScriptPath}/lib/bashinator.lib.0.sh" # APIv0

## include required source files
if ! source "${__BashinatorConfig}"; then
    echo "!!! FATAL: failed to source bashinator config '${__BashinatorConfig}'" 1>&2
    exit 2
fi
if ! source "${__BashinatorLibrary}"; then
    echo "!!! FATAL: failed to source bashinator library '${__BashinatorLibrary}'" 1>&2
    exit 2
fi

##
## boot bashinator:
## - if configured, it can check for a minimum required bash version
## - if configured, it can enforce a safe PATH
## - if configured, it can enforce a specific umask
## - it enables required bash settings (e.g. extglob, extdebug)
##

__boot

##
## application library and config
##

## load shared lib files 
export ApplicationSharedLibCheckIp="${__ScriptPath}/lib/lib.shared.checkip.sh"

## accepting overrides[1] using user-defined environment variables:
export ApplicationConfig="${__ScriptPath}/etc/cfg.${__ScriptName}.sh"
export ApplicationLibrary="${__ScriptPath}/lib/lib.${__ScriptName}.sh"

## include required source files (using bashinator functions with builtin error handling)
__requireSource "${ApplicationSharedLibCheckIp}"
__requireSource "${ApplicationConfig}"
__requireSource "${ApplicationLibrary}"

##
## dispatch the application with all original command line arguments
##

__dispatch "${@}"

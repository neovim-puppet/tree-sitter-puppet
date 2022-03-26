# asdf

case $operatingsystem { # aSDF
  'centos', 'redhat': { $service_name = 'ntpd' }
  'debian', 'ubuntu': { $service_name = 'ntp' }
  default: { $service_name = 'asdf' }
}

package { 'ntp':
  ensure => installed,
}

service { 'ntp':
  ensure    => running,
  name      => $service_name,
  enable    => true,
  subscribe => File['ntp.conf'],
}

file { 'ntp.conf':
  ensure  => file,
  path    => '/etc/ntp.conf',
  require => Package['ntp'],
  source  => 'puppet:///modules/ntp/ntp.conf',
  # This source file would be located on the primary Puppet server at
  # /etc/puppetlabs/code/modules/ntp/files/ntp.conf
}

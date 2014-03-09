<?php require('./config.php'); ?>
#!/bin/bash

export INSTALL=""
<?php foreach (explode(',', CHECK_INSTALL) as $install) { ?>
if [ ! -e /usr/bin/polipo ]; then
	export INSTALL="$INSTALL <?php echo $install; ?>"
fi
<?php } ?>

apt-get install -y $INSTALL
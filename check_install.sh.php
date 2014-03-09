<?php require('./config.php'); ?>
#!/bin/bash

export INSTALL=""
<?php foreach (explode(',', CHECK_INSTALL) as $install) { ?>
if [ ! -e /usr/bin/polipo ]; then
	export INSTALL="$INSTALL <?php echo $install; ?>"
	update-rc.d -f <?php echo $install; ?> remove
fi
<?php } ?>

apt-get install -y $INSTALL
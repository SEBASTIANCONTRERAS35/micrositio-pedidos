# 📘 Módulo 2 (desde 0) — Linux para administrar el cluster

> Por qué importa: las 3 máquinas de tu cluster (master + 2 workers) son
> Rocky Linux. Todo K8s corre ENCIMA de Linux. El profe arrancó el semestre con esto.

## 2.1 Usuarios y grupos
- Usuario = una cuenta. Grupo = un conjunto de usuarios (para dar permisos juntos).
- Cada usuario tiene 1 grupo PRIMARIO y puede estar en varios SECUNDARIOS.
- Archivos: /etc/passwd (usuarios), /etc/group (grupos), /etc/shadow (contraseñas cifradas).

Comandos:
  useradd mexico                 # crear usuario
  passwd mexico                  # ponerle contraseña
  groupadd -g 2000 america       # crear grupo con GID 2000
  usermod -G 2000 mexico         # agregar a grupo SECUNDARIO (-G mayúscula)
  usermod -g 2000 mexico         # cambiar grupo PRIMARIO (-g minúscula)
  id mexico                      # ver UID, GID y grupos
  groups mexico                  # ver grupos del usuario
  cat /etc/passwd                # ver todos los usuarios
  userdel -r mexico              # borrar usuario y su carpeta home

Clave: -g (minúscula) = primario, -G (mayúscula) = secundarios.

## 2.2 Permisos
Cada archivo tiene permisos para 3 grupos: dueño (u), grupo (g), otros (o).
3 tipos: leer (r=4), escribir (w=2), ejecutar (x=1). Se suman.
  7 = rwx (4+2+1)   6 = rw- (4+2)   5 = r-x (4+1)   4 = r-- (solo lectura)

Leer `ls -l`:
  -rwxr-xr--  1 root  root  ...
   │└┬┘└┬┘└┬┘
   │ u   g   o    (dueño rwx, grupo r-x, otros r--)
   └ tipo (- archivo, d carpeta, l enlace)

Comandos:
  ls -l archivo                  # ver permisos
  ls -ld carpeta                 # ver permisos de una carpeta
  chmod 755 archivo              # poner permisos en octal (rwxr-xr-x)
  chmod g+s carpeta              # setgid: archivos nuevos heredan el grupo
  chmod 1777 /publico            # sticky bit: solo el dueño borra sus archivos
  chown usuario:grupo archivo    # cambiar dueño y grupo
  umask                          # ver permisos por defecto (suele ser 022)

Cálculo umask: carpetas 777-umask, archivos 666-umask. Con 022 → 755 y 644.

## 2.3 LVM (extender un disco sin apagar)
LVM = capa flexible sobre los discos. Permite agrandar el espacio en caliente.
Capas: Disco físico → PV (physical volume) → VG (volume group) → LV (logical volume) → filesystem.

Flujo para agrandar (visto en clase):
  lsblk                          # ver discos y particiones
  df -h                          # ver espacio usado por punto de montaje
  vgs ; pvs ; lvs                # ver volume groups / physical volumes / logical volumes
  pvcreate /dev/nvme0n1p4        # 1. convertir partición nueva en PV
  vgextend rl /dev/nvme0n1p4     # 2. agregar ese PV al VG llamado 'rl'
  lvextend -L +2G /dev/rl/root   # 3. agrandar el LV en 2GB
  xfs_growfs /dev/rl/root        # 4. agrandar el filesystem (XFS en Rocky)
                                 #    (si fuera ext4 sería: resize2fs)

## 2.4 Hardening (endurecer la seguridad)
Hardening = reducir la "superficie de ataque": cerrar todo lo que no se usa.

### SELinux (control de acceso obligatorio del kernel)
  getenforce                     # ver modo: Enforcing / Permissive / Disabled
  sestatus                       # estado detallado
  setenforce 0                   # cambiar a Permissive (temporal)
  setenforce 1                   # cambiar a Enforcing
  # permanente: editar /etc/selinux/config -> SELINUX=enforcing
Modos: Enforcing (bloquea), Permissive (solo registra), Disabled (apagado).

### SSH seguro (/etc/ssh/sshd_config)
  PermitRootLogin no             # no permitir entrar como root
  PasswordAuthentication no      # solo llaves, no contraseñas
  systemctl restart sshd         # aplicar cambios
Llaves SSH:
  ssh-keygen -t ed25519          # generar par de llaves (privada + pública)
  ssh-copy-id usuario@servidor   # copiar tu llave pública al servidor

### sudo (dar permisos de admin sin dar root)
  visudo                         # editar sudoers DE FORMA SEGURA (valida sintaxis)
  # en Rocky el grupo 'wheel' tiene sudo:
  usermod -aG wheel mexico       # dar admin a 'mexico'
  cat /var/log/secure | grep sudo  # ver quién usó sudo (trazabilidad)

## Lo que debes poder decir
- Usuario/grupo; -g primario vs -G secundario.
- Permisos en octal (7=rwx) y leer ls -l.
- LVM: pvcreate → vgextend → lvextend → xfs_growfs.
- Hardening: SELinux (getenforce), SSH (PermitRootLogin no + llaves), sudo (visudo, grupo wheel).

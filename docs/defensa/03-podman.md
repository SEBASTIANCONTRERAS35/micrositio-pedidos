# 📘 Módulo 3 (desde 0) — Podman / Contenedores

> Por qué importa: antes de Kubernetes hay que saber construir y correr UN
> contenedor a mano. K8s solo automatiza esto a gran escala. El profe usó Podman.

## 3.1 ¿Qué es Podman?
Podman es una herramienta para CONSTRUIR imágenes y CORRER contenedores.
Es casi idéntico a Docker (mismos comandos), pero:
- No necesita un "demonio" (programa de fondo) corriendo siempre.
- Corre "rootless" (sin permisos de root) -> más seguro.
- Truco: `alias docker=podman` y todo funciona igual.

## 3.2 Imagen vs contenedor (recordatorio)
- Imagen = receta congelada (se construye con un Containerfile/Dockerfile).
- Contenedor = la receta corriendo. De 1 imagen -> muchos contenedores.

## 3.3 El Containerfile (la receta)
Archivo de texto con los pasos para armar la imagen. Ejemplo real:
  FROM python:3.12-slim          # parte de una imagen base
  WORKDIR /app                   # carpeta de trabajo dentro
  COPY requirements.txt .        # copia un archivo
  RUN pip install -r requirements.txt   # ejecuta un comando al construir
  COPY app.py .                  # copia el código
  EXPOSE 8080                    # documenta el puerto
  CMD ["python", "app.py"]       # comando que corre al arrancar
Instrucciones clave: FROM (base), COPY (copiar), RUN (ejecutar al construir),
CMD (lo que corre al iniciar el contenedor), EXPOSE (puerto), WORKDIR (carpeta).

## 3.4 Construir y correr — comandos
  podman build -t miapp:1.0 .              # construir imagen desde Containerfile (. = aquí)
  podman images                            # listar imágenes locales
  podman run -d --name web -p 8080:80 miapp:1.0   # correr en segundo plano
  podman ps                                # ver contenedores corriendo
  podman ps -a                             # ver TODOS (incluso detenidos)
  podman logs web                          # ver logs
  podman exec -it web /bin/bash            # entrar al contenedor
  podman stop web                          # detener
  podman rm web                            # borrar el contenedor
  podman rmi miapp:1.0                     # borrar la imagen
  podman pull nginx                        # descargar una imagen de internet

Banderas de `run`:
  -d           = detached (en segundo plano)
  --name web   = ponerle nombre
  -p 8080:80   = publicar puerto host:contenedor (afuera 8080 -> adentro 80)
  -e VAR=valor = variable de entorno
  -v vol:/ruta = montar un volumen
  --network X  = conectar a una red

## 3.5 Volúmenes (guardar datos que NO se borran)
Un contenedor es desechable: si lo borras, pierdes lo que tenía adentro.
Un VOLUMEN guarda datos FUERA del contenedor, así persisten.
  podman volume create datos               # crear volumen
  podman volume ls                         # listar
  podman run -d -v datos:/var/lib/mysql mysql:8.0   # montar volumen en una ruta
  podman volume inspect datos              # ver dónde se guarda

## 3.6 Redes (que los contenedores se hablen por nombre)
  podman network create mired              # crear una red
  podman network ls                        # listar redes
  podman run -d --network mired --name db postgres   # conectar a la red
  # dentro de "mired", otro contenedor alcanza a "db" por su NOMBRE, no por IP
  podman inspect <contenedor> | grep -i ipaddress    # ver su IP

## 3.7 Pods en Podman (precursor del Pod de K8s)
Podman puede agrupar contenedores en un "pod" que comparten red (localhost):
  podman pod create --name mipod -p 8084:8084
  podman run -d --pod mipod --name web miapp:1.0
  podman pod ps
Es el MISMO concepto que el Pod de Kubernetes (varios contenedores, 1 red).

## Lo que debes poder decir
- Podman = construir/correr contenedores, sin demonio, rootless (≈ Docker).
- Containerfile: FROM, COPY, RUN, CMD, EXPOSE.
- build -> images -> run -p host:contenedor -> ps -> logs -> exec -> stop/rm.
- Volumen = datos persistentes fuera del contenedor.
- Red = contenedores se hablan por nombre (DNS).
- Pod = varios contenedores compartiendo red (igual que en K8s).

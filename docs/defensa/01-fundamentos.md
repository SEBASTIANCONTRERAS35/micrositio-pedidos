# 📘 Módulo 1 (desde 0) — ¿Qué es un contenedor y qué es Kubernetes?

> Regla: cada palabra nueva se define apenas aparece. Sin herramientas del
> proyecto todavía (eso es el Módulo 9).

## 1.1 El problema que queremos resolver
Tienes una aplicación (tu micrositio: una página web con su servidor). Quieres
que corra en un servidor de internet, siempre encendida, y que no se caiga.
Problemas reales:
- "En mi compu funciona, pero en el servidor no." (versiones distintas)
- Si el servidor se apaga, la app muere.
- Si llega mucha gente, un solo servidor no aguanta.

## 1.2 ¿Qué es un contenedor?
Un contenedor es una CAJA que empaqueta tu app + TODO lo que necesita para
correr (librerías, versión exacta, configuración). Esa caja corre IGUAL en
cualquier lado.
- Analogía: una lonchera. Llevas tu comida con todo; no dependes de que el lugar
  tenga lo que necesitas.
- Se diferencia de una "máquina virtual" en que el contenedor NO trae un sistema
  operativo completo: usa el del servidor. Por eso es ligero y arranca en segundos.

## 1.3 Imagen vs contenedor
- IMAGEN = la receta / el molde. Un archivo congelado con tu app y dependencias.
- CONTENEDOR = la receta ya cocinada y corriendo. De UNA imagen puedes lanzar
  MUCHOS contenedores iguales.
- La imagen se crea con un archivo de instrucciones llamado Dockerfile
  (lista de pasos: "parte de Node, copia mi código, arranca el servidor").

## 1.4 ¿Qué es Kubernetes?
Cuando tienes muchos contenedores, manejarlos a mano es imposible. Kubernetes
(se abrevia "K8s") es un PROGRAMA QUE ADMINISTRA contenedores por ti. Se llama
"orquestador".
Lo que hace solo:
- Si un contenedor se cae, lo vuelve a levantar.
- Mantiene varias copias (réplicas) y reparte el tráfico entre ellas.
- Actualiza sin apagar el servicio.
- Crea más copias si hay más carga.
- Analogía: K8s es el GERENTE de un restaurante. Tú dices "quiero 3 cocineros
  siempre activos"; si uno se va, el gerente contrata otro sin que tú hagas nada.

## 1.5 Declarativo (la forma de pedirle cosas a K8s)
No le das órdenes paso a paso. Le ENTREGAS UN PAPEL que dice cómo quieres que
estén las cosas ("quiero 3 copias de mi app"). K8s se encarga de lograrlo y de
MANTENERLO así. Ese mantenerlo se llama "reconciliación": K8s compara lo que
pediste vs lo que hay, y corrige la diferencia, todo el tiempo.
- Ese papel se escribe en YAML (un formato de texto con sangrías).

## 1.6 El cluster: máquinas que forman Kubernetes
Un "cluster" es un grupo de servidores trabajando juntos. Hay 2 tipos:
- MASTER (cerebro): decide y recuerda todo. (En tu proyecto: k8s-master01)
- WORKERS (músculos): aquí corren de verdad tus contenedores. (Tus 2 workers)
El master da órdenes, los workers ejecutan.

## 1.7 Pod: la cajita donde K8s mete tu contenedor
K8s no corre "contenedores sueltos"; los mete en una envoltura llamada POD.
- Normalmente: 1 pod = 1 contenedor.
- Los pods son desechables: si mueren, K8s crea otro (con otra dirección IP).

## 1.8 kubectl: cómo le hablas al cluster
`kubectl` es el comando para dar instrucciones al cluster. Ejemplos:
- `kubectl get nodes`   → ver las máquinas del cluster
- `kubectl get pods`    → ver los contenedores corriendo
- `kubectl apply -f x.yaml` → entregar el "papel" con lo que quieres
- `kubectl logs <pod>`  → ver los mensajes de un contenedor

## 1.9 Dos palabras que verás siempre
- NAMESPACE = una carpeta para organizar cosas dentro del cluster. Tu app está
  en la carpeta "micrositio".
- LABELS = etiquetas (como stickers) que le pones a las cosas para encontrarlas.
  Ej: etiqueta "app: api". Otras piezas dicen "conéctame con lo que tenga la
  etiqueta app: api".

## Lo que debes poder decir tras este módulo
1. Contenedor = caja con la app y sus dependencias; corre igual en cualquier lado.
2. Imagen = receta; contenedor = receta cocinada y corriendo.
3. Kubernetes = gerente que administra contenedores (los levanta, replica, escala).
4. Declarativo = le das un papel con lo que quieres; él lo mantiene (reconciliación).
5. Master = cerebro; Workers = músculos. Pod = cajita del contenedor.

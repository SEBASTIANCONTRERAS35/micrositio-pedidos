# Fase 7 — CI/CD: Tekton + ArgoCD + Argo Rollouts · Checklist

> Pipeline completo + canary release.
> Días 18–19 (vie 30 mayo – sáb 31 mayo).

## Lo que YO ya hice

- [x] `tekton/tasks/git-clone.yaml`
- [x] `tekton/tasks/install-deps.yaml` (npm ci)
- [x] `tekton/tasks/lint-test.yaml` (eslint + vitest)
- [x] `tekton/tasks/trivy-scan.yaml` (fs e image)
- [x] `tekton/tasks/kaniko-build.yaml` (build + push, sin Docker daemon)
- [x] `tekton/pipeline.yaml` (encadena: clone → trivy-fs → lint-test → kaniko-build → trivy-image)
- [x] `tekton/pipelinerun-example.yaml`
- [x] `argocd/application.yaml` (selfHeal + prune + ignoreDifferences para KEDA replicas)
- [x] `k8s/rollouts/api-rollout.yaml` (Canary 10→50→100)
- [x] `k8s/rollouts/analysis-template.yaml` (BONUS +3)

## Lo que TÚ tienes que hacer

### 1. Instalar Tekton Pipelines
```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply --filename https://storage.googleapis.com/tekton-releases/dashboard/latest/release-full.yaml
```

### 2. Crear cuenta Docker Hub y crear secret de credenciales
```bash
# En Docker Hub: crear access token
kubectl create secret generic docker-credentials \
  --from-literal=config.json='{"auths":{"https://index.docker.io/v1/":{"auth":"BASE64-USERNAME:TOKEN"}}}' \
  -n tekton-pipelines

# El base64 se genera asi:
echo -n "tu-usuario:tu-token" | base64
```

### 3. Aplicar Tekton tasks y pipeline
```bash
kubectl apply -f tekton/tasks/
kubectl apply -f tekton/pipeline.yaml
```

### 4. Disparar PipelineRun manualmente (primer test)
```bash
kubectl create -f tekton/pipelinerun-example.yaml

# Watch
kubectl get pipelinerun -n tekton-pipelines -w
kubectl logs -f -n tekton-pipelines -l tekton.dev/pipelineRun=<nombre>
```

### 5. Instalar ArgoCD
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Esperar a que este Ready
kubectl wait --for=condition=available --timeout=300s deployment -n argocd --all

# Password inicial
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d
```

### 6. Aplicar Application
```bash
kubectl apply -f argocd/application.yaml

# Acceder a UI
kubectl port-forward -n argocd svc/argocd-server 8080:443
# https://localhost:8080 (user: admin)
```

### 7. Instalar Argo Rollouts
```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Plugin kubectl
brew install argoproj/tap/kubectl-argo-rollouts
```

### 8. Convertir Deployment del API a Rollout
```bash
# Eliminar el Deployment viejo
kubectl delete deployment api -n micrositio

# Aplicar el Rollout
kubectl apply -f k8s/rollouts/

# Verificar
kubectl argo rollouts get rollout api -n micrositio
```

### 9. Test del flujo completo: git push → deploy
```bash
./scripts/demo-5-cicd.sh
```

### 10. Test del canary
```bash
./scripts/demo-6-canary.sh
```

## Checkpoint
✅ Tekton instalado y dashboard accesible
✅ PipelineRun corre exitosamente todos los pasos (incluido Trivy scan)
✅ ArgoCD instalado y muestra Application "Synced"
✅ Argo Rollouts instalado, API es Rollout (no Deployment)
✅ git push → Tekton build → ArgoCD sync → cluster actualizado en ~2 min
✅ Canary 10→50→100 con pause de 2 min funciona
✅ AnalysisTemplate aborta canary si error rate >5% (BONUS +3)

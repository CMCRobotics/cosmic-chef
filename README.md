# Cosmic Chef 🧑‍🍳🌟

**Cosmic Chef** is an Augmented Reality game that invites you to cook the universe.
Use your skills to assemble fundamental particles and satiate the never-ending appetite of the primordial chaos.

Inspired by classic collaborative games such as **Overcooked** or **Keep Talking...**, **Cosmic Chef** pits teams against 
each other with the task of assembling fundamental particles called *hadrons*.


## 📸 Screenshots




## ⚙️ How to Develop ?

### How to reset your broker's persistent data (Mosquitto)

```bash
sudo service mosquitto stop && sudo rm /var/lib/mosquitto/mosquitto.db && sudo service mosquitto start
```

### Useful commands

* Set up a blue team with three sous chefs ```MQTT_BROKER="wss://cosmic-chef-mqtt.app.cern.ch" node scripts/register-team.ts blue 3```


## 🚀 Deployment (CERN PaaS / OpenShift)

Every push to `develop` builds the image (Kaniko, via `.gitlab-ci.yml`) and then runs the `deploy-paas` job, which installs the Helm chart in `chart/` with `chart/values-paas.yaml`. The release is named `cosmic-chef` in the `intelligence-machine` project on `https://api.paas.okd.cern.ch`.

### One-time setup (project admin)

Run these with your own login, not the CI account:

```bash
oc project intelligence-machine

# Dedicated ServiceAccount for GitLab CI
oc create sa gitlab-deployer

# Role for what Helm and the chart need, bound only to that account
oc apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: gitlab-deployer
rules:
  - apiGroups: [""]
    resources: ["secrets", "configmaps", "services", "pods", "pods/log", "events"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["route.openshift.io"]
    resources: ["routes"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["route.openshift.io"]
    resources: ["routes/custom-host"]
    verbs: ["create", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: gitlab-deployer
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: gitlab-deployer
subjects:
  - kind: ServiceAccount
    name: gitlab-deployer
    namespace: intelligence-machine
EOF

# Long-lived token for the ServiceAccount
oc apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: gitlab-deployer-token
  annotations:
    kubernetes.io/service-account.name: gitlab-deployer
type: kubernetes.io/service-account-token
EOF

# Check the permissions (each should print "yes")
oc auth can-i list secrets -n intelligence-machine --as=system:serviceaccount:intelligence-machine:gitlab-deployer
oc auth can-i create deployments -n intelligence-machine --as=system:serviceaccount:intelligence-machine:gitlab-deployer
oc auth can-i create routes/custom-host -n intelligence-machine --as=system:serviceaccount:intelligence-machine:gitlab-deployer
```

The token doesn't expire on its own. To read it:

```bash
oc get secret gitlab-deployer-token -n intelligence-machine -o jsonpath='{.data.token}' | base64 -d
```

### Image pull secret

The cluster pulls the image from the GitLab registry, so the project needs a pull secret. `chart/values-paas.yaml` references it as `gitlab-registry-cosmic-chef`. The name is unique to this chart so it doesn't clash with other apps in the namespace.

1. In GitLab, go to the project → Settings → Repository → Deploy tokens. Create a token with the `read_registry` scope and note its username and password.
2. Create the secret:

```bash
oc create secret docker-registry gitlab-registry-cosmic-chef -n intelligence-machine \
  --docker-server=gitlab-registry.cern.ch \
  --docker-username='<deploy-token-username>' \
  --docker-password='<deploy-token-password>'
```

Check it with `oc get secret gitlab-registry-cosmic-chef -n intelligence-machine`. Rotate the deploy token by revoking it in GitLab, creating a new one and recreating the secret.

### GitLab CI/CD variables

Set these under Settings → CI/CD → Variables. Mark the token as masked and protected, and don't commit it.

| Variable | Value |
|----------|-------|
| `OPENSHIFT_TOKEN` | Token of the `gitlab-deployer` ServiceAccount |
| `OPENSHIFT_PROJECT` | `intelligence-machine` |

`OPENSHIFT_API_URL` is set in the job itself.

### Troubleshooting

- **`ConfigMap ... exists and cannot be imported into the current release`:** another Helm release in the namespace owns the resource. Run `helm list -n intelligence-machine`, and uninstall the old release only if nothing depends on it.
- **`secrets is forbidden` / `cannot create deployments`:** the `gitlab-deployer` Role or RoleBinding is missing. Re-run the `can-i` checks above.
- **`spec.host: Forbidden`:** the Role lacks `routes/custom-host`, or the PaaS hasn't assigned the `*.app.cern.ch` hosts to the project. Ask the platform team.
- **Pods don't roll out after a deploy:** the chart sets a `cosmic-chef/commit-sha` pod annotation on each deploy. If it's missing from the Deployment, the chart values weren't passed through.

## 📱 Compatibility

- Works on WebXR-enabled browsers
- Supports both mobile and desktop devices
- Requires camera access for AR features

## 📄 License

This project is licensed under the terms included in the [LICENSE](LICENSE) file.


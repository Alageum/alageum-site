# Infrastructure boundary

The current DEV topology is defined in the root `docker-compose.yml`: PostgreSQL 16, FastAPI, local object storage volume, and Next.js. Production IaC is intentionally not invented before the client's hosting, network, security, backup, and operations requirements are known.

Future provider-specific Terraform/Kubernetes/Ansible assets belong here after Discovery. They must consume external secrets and must not embed credentials in source control.

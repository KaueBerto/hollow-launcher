# AVERON Launcher 2.8.2

- Distribui como padrão as configurações atuais do responsável pelo servidor para Entity Model Features e Entity Texture Features.
- Padroniza `emf_compat.json`, `entity_model_features.json`, `entity_texture_features.json` e `etf_warnings.json` também em instalações existentes.
- A migração acontece uma única vez e preserva qualquer configuração anterior diferente em `profile-defaults-backups`.
- O reset mantém tanto o preset aplicado quanto o backup anterior.
- Os quatro arquivos foram comparados por SHA-256 com o perfil de origem antes do empacotamento.

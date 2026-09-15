# Runbook — Ambiente Big Data (Hadoop/HDFS) com dados do Cypher

Trabalho da disciplina de Big Data (Hadoop): construir um ambiente Hadoop/HDFS
numa VM da Oracle Cloud e carregar nele um CSV com dados reais da solução
proposta para a empresa parceira (Metaindústria) — os **incidentes de
segurança** (EPI ausente, postura de risco, quedas) detectados pelo Cypher.

O CSV vem do endpoint de relatório que já existe no backend
(`GET /api/v1/reports/incidents.csv`), exportado com
[`scripts/exportar-incidentes-csv.sh`](../scripts/exportar-incidentes-csv.sh).
Colunas: `id, incidentKey, cameraId, type, severity, nivel, reason, zoneName,
detectedAt, endedAt, durationSeconds, status` — ver
[`CsvReportBuilder`](../../../cypher/src/main/java/com/dev4/cypher/report/CsvReportBuilder.java)
no backend para o formato exato.

## 0. Gerar o CSV localmente

Com os 3 projetos no ar e a empresa demo semeada
(`./scripts/subir-empresa-demo.sh start`):

```bash
cd ~/projects/challenge/cypher-front
./scripts/exportar-incidentes-csv.sh
```

Gera `./data-export/incidentes.csv`. Se quiser mais linhas antes de exportar,
deixe o pipeline de captura rodando um pouco mais (cada incidente novo detectado
vira uma linha).

## 1. Acesso à VM

**Linux/macOS (`ssh`, exige `.pem` — converta o `.ppk` com `puttygen` se só
tiver esse formato):**

```bash
chmod 600 caminho/para/sua-chave.pem
ssh -i caminho/para/sua-chave.pem opc@<IP-DA-VM>
```

**Windows com PuTTY** — se você já tem a sessão configurada (host + chave
`.ppk`), é só abrir a sessão salva no PuTTY normalmente; os comandos deste
runbook a partir daqui rodam dentro do terminal que o PuTTY abre, exatamente
como num terminal Linux comum.

Assume-se **Oracle Linux** (imagem padrão da Oracle Cloud, compatível com
`yum`, mesma família do CentOS 7 usado no material da disciplina).

## 2. Usuários e SO (como `opc`)

```bash
sudo passwd root      # Fiap@123
sudo passwd opc       # Fiap@123

sudo adduser hadoop
sudo passwd hadoop    # Fiap@123
```

Liberar sudo para `hadoop` (edita a linha ~101 de `/etc/sudoers`):

```bash
sudo nano +101 /etc/sudoers
```

Adicionar junto da linha do `root`:

```
root      ALL=(ALL)       ALL
hadoop    ALL=(ALL)       ALL
```

Salvar com `Ctrl+X`, `Y`, `Enter`. Trocar para o usuário `hadoop` (todo o
resto do runbook roda como `hadoop`):

```bash
sudo su - hadoop
```

## 3. Java Development Kit

```bash
sudo yum list java*
sudo yum -y remove java*

mkdir ~/downloads && cd ~/downloads
wget https://javadl.oracle.com/webapps/download/GetFile/1.8.0_261-b12/a4634525489241b9a9e1aa73d9e118e6/linux-i586/jdk-8u261-linux-x64.tar.gz
tar -xvzf jdk-8u261-linux-x64.tar.gz
sudo mv jdk1.8.0_261/ /opt/jdk
```

`~/.bashrc`:

```bash
# JAVA JDK
export JAVA_HOME=/opt/jdk
export PATH=$PATH:$JAVA_HOME/bin
```

```bash
source ~/.bashrc
java -version
```

> O link da Oracle acima expira com frequência. Se o `wget` falhar, baixe o
> JDK 8u261 Linux x64 manualmente (login Oracle) e suba com
> `scp -i sua-chave.ppk jdk-8u261-linux-x64.tar.gz hadoop@<IP-DA-VM>:~/downloads/`.

## 4. Hadoop 3.2.1

```bash
cd ~/downloads
wget https://archive.apache.org/dist/hadoop/common/hadoop-3.2.1/hadoop-3.2.1.tar.gz
tar -xvzf hadoop-3.2.1.tar.gz
sudo mv hadoop-3.2.1 /opt/hadoop
```

`~/.bashrc` (acrescentar):

```bash
# Hadoop
export HADOOP_HOME=/opt/hadoop
export HADOOP_INSTALL=$HADOOP_HOME
export HADOOP_COMMON_HOME=$HADOOP_HOME
export HADOOP_MAPRED_HOME=$HADOOP_HOME
export HADOOP_HDFS_HOME=$HADOOP_HOME
export YARN_HOME=$HADOOP_HOME
export PATH=$PATH:$HADOOP_HOME/bin:$HADOOP_HOME/sbin
```

```bash
source ~/.bashrc
```

## 5. Configuração do Hadoop

```bash
cd $HADOOP_HOME/etc/hadoop
nano core-site.xml
```

```xml
<configuration>
    <property>
        <name>fs.defaultFS</name>
        <value>hdfs://localhost:9000</value>
    </property>
</configuration>
```

```bash
nano hdfs-site.xml
```

```xml
<configuration>
    <property>
        <name>dfs.replication</name>
        <value>1</value>
    </property>
</configuration>
```

## 6. SSH sem senha (necessário para o Hadoop subir os daemons)

```bash
ssh-keygen -t rsa -P '' -f ~/.ssh/id_rsa
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 0600 ~/.ssh/authorized_keys
```

Permitir o usuário `hadoop` no SSH (linha ~42 de `/etc/ssh/sshd_config`):

```bash
sudo nano +42 /etc/ssh/sshd_config
```

```
AllowUsers opc hadoop
```

```bash
sudo systemctl restart sshd
ssh localhost   # aceitar a chave, depois `exit`
exit
```

## 7. Subir o HDFS

```bash
hdfs namenode -format
start-dfs.sh
jps   # deve listar NameNode, DataNode, SecondaryNameNode
```

NameNode UI: `http://<IP-DA-VM>:9870/`.

## 8. YARN

```bash
nano $HADOOP_HOME/etc/hadoop/mapred-site.xml
```

```xml
<configuration>
    <property>
        <name>mapreduce.framework.name</name>
        <value>yarn</value>
    </property>
    <property>
        <name>mapreduce.application.classpath</name>
        <value>$HADOOP_MAPRED_HOME/share/hadoop/mapreduce/*:$HADOOP_MAPRED_HOME/share/hadoop/mapreduce/lib/*</value>
    </property>
</configuration>
```

```bash
nano $HADOOP_HOME/etc/hadoop/yarn-site.xml
```

```xml
<configuration>
    <property>
        <name>yarn.nodemanager.aux-services</name>
        <value>mapreduce_shuffle</value>
    </property>
    <property>
        <name>yarn.nodemanager.env-whitelist</name>
        <value>JAVA_HOME,HADOOP_COMMON_HOME,HADOOP_HDFS_HOME,HADOOP_CONF_DIR,CLASSPATH_PREPEND_DISTCACHE,HADOOP_YARN_HOME,HADOOP_MAPRED_HOME</value>
    </property>
</configuration>
```

```bash
start-yarn.sh
jps   # deve acrescentar ResourceManager e NodeManager
```

## 9. Carregar o CSV do Cypher no HDFS

Do seu computador (fora da VM), envie o CSV gerado no passo 0.

**Linux/macOS (`scp`):**

```bash
scp -i caminho/para/sua-chave.ppk \
  ~/projects/challenge/cypher-front/data-export/incidentes.csv \
  hadoop@<IP-DA-VM>:~/incidentes.csv
```

**Windows com PuTTY (`pscp`)** — já com a sessão do PuTTY configurada e
testada para a VM, use o `pscp` (equivalente do `scp`, instalado junto do
PuTTY) direto no PowerShell/CMD:

```powershell
pscp -i C:\caminho\para\sua-chave.ppk `
  C:\caminho\para\incidentes.csv `
  hadoop@<IP-DA-VM>:/home/hadoop/incidentes.csv
```

- `-i` aponta para a chave `.ppk` (o `pscp` já entende `.ppk` nativamente —
  diferente do `scp` do OpenSSH, não precisa converter para `.pem`).
- Se o PuTTY já guarda essa sessão salva (host + chave configurados na GUI),
  dá para usar o nome da sessão em vez de `usuário@IP`:
  `pscp -load NomeDaSessao C:\caminho\para\incidentes.csv hadoop@<IP-DA-VM>:~/incidentes.csv`.
- Se preferir GUI em vez de linha de comando, o **WinSCP** reaproveita a
  mesma sessão/chave `.ppk` do PuTTY (ele lê o Pageant/registro do PuTTY) e
  permite arrastar o arquivo visualmente até `/home/hadoop/`.
- `pscp` não vem por padrão no `PATH` do Windows — se o comando não for
  encontrado, rode a partir da pasta de instalação do PuTTY (normalmente
  `C:\Program Files\PuTTY\pscp.exe`) ou adicione essa pasta ao `PATH`.

De volta na VM (usuário `hadoop`):

```bash
hdfs dfs -mkdir /sprint
hdfs dfs -copyFromLocal ~/incidentes.csv /sprint

# verificação
hdfs dfs -ls /sprint
hdfs dfs -cat /sprint/incidentes.csv | head
```

## 10. Entrega

Arquivo `.txt` para postar no portal do aluno FIAP — preencher e salvar como
`entrega-big-data.txt` (template abaixo, não versionado neste repo por trazer
dados pessoais dos integrantes):

```
RM e Nome completo dos integrantes:
- RM ______ - Nome Completo 1
- RM ______ - Nome Completo 2
- RM ______ - Nome Completo 3

Endereço IP da máquina da Cloud Oracle: <IP-DA-VM>
```

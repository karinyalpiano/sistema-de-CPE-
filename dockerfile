# Usar imagem base do Python 3.9 com uma versão mais enxuta (slim)
FROM python:3.9-slim

# Definir diretório de trabalho
WORKDIR /app

# Copiar o arquivo requirements.txt
COPY requirements.txt .

# Instalar as dependências no ambiente virtual
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todos os arquivos do projeto para o contêiner
COPY . .

# Configurar variáveis de ambiente
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0  
ENV FLASK_RUN_PORT=5000     

# Expor a porta 5000 para o mundo externo
EXPOSE 5000

# Rodar o servidor Flask
CMD ["flask", "run"]

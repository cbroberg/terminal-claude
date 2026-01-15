# Replace "cbroberg/repo-template" with your GitHub repo name
REPO="cbroberg/repo-template"

while IFS='=' read -r key value
do
  if [[ ! -z "$key" && ! "$key" =~ ^# ]]; then
    echo "Uploading $key..."
    gh secret set "$key" -b"$value" -R "$REPO"
  fi
done < .env

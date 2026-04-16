#!/usr/bin/env bash

echo " "
echo "Pulling Model"
echo " "

cd server/models


### Here's the models, theres a selecter on the mod version, this one is just to be normal


# use this for the good one 35b
# curl -L --progress-bar -o model.gguf "https://huggingface.co/ibm-granite/granite-4.0-h-small-GGUF/resolve/main/granite-4.0-h-small-Q4_K_M.gguf"

# use this for the testing as bad one 1b
# curl -L --progress-bar -o model.gguf "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
curl -L --progress-bar -o model.gguf "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-BF16.gguf"

# The French One 7b
# curl -L --progress-bar -o model.gguf "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_0.gguf"

# ibm testing model
# curl -L -o model.gguf "https://huggingface.co/ibm-granite/granite-4.0-h-1b-GGUF/resolve/main/granite-4.0-h-1b-Q4_K_M.gguf"



# storing if you dont have curl and need wget
# wget -q --show-progress -O model.gguf "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_0.gguf"


# use the meta model llama4 scout, with 128 gigs of ram would be idea. 64 if we have to MIGHT work

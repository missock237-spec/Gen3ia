#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
echo "Diagnostic Genova"
echo "================"
echo -n "Node.js: "
if command -v node &> /dev/null; then echo -e "${GREEN}$(node -v)${NC}"; else echo -e "${RED}Non installe${NC}"; fi
echo -n "npm: "
if command -v npm &> /dev/null; then echo -e "${GREEN}$(npm -v)${NC}"; else echo -e "${RED}Non installe${NC}"; fi
echo -n "PostgreSQL: "
if command -v psql &> /dev/null; then echo -e "${GREEN}Installe${NC}"; else echo -e "${YELLOW}Non detecte${NC}"; fi
echo -n "Redis: "
if command -v redis-cli &> /dev/null; then echo -e "${GREEN}Installe${NC}"; else echo -e "${YELLOW}Non detecte${NC}"; fi
echo -n "Prisma: "
if [ -f node_modules/.prisma/client/index.js ]; then echo -e "${GREEN}Client genere${NC}"; else echo -e "${RED}Client manquant${NC}"; fi
echo ""
for var in DATABASE_URL AUTH_SECRET NEXT_PUBLIC_APP_URL; do
  val="${!var}"
  if [ -n "$val" ]; then echo -e "  $var: ${GREEN}Configure${NC}"; else echo -e "  $var: ${RED}Manquant${NC}"; fi
done
echo ""
if [ -d .next ]; then echo "Build existant: $(du -sh .next | cut -f1)"; fi

# Development/staging candidate only. Review and pin the base image digest before production.
FROM node:22.13.0-alpine
ENV NODE_ENV=production
WORKDIR /srv/stuora-scanner
COPY --chown=node:node clamd.mjs index.mjs ./
USER node
EXPOSE 8787
CMD ["node","index.mjs"]

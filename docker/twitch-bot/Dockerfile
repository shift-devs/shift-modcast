FROM archlinux

# ARGS
ARG USER
ENV USER="modcast"

ARG MOD_HOME
ENV MOD_HOME="/opt/modcast"

ENV MOD_ENV="/etc/modcast"
ENV MOD_BIN="/usr/bin/modcast-twitch-bot"

# Install dependencies
RUN pacman -Syyuu --quiet --noconfirm
# RUN pacman -S vim --noconfirm

# Create the Modcast User
COPY configs/modcast.conf /usr/lib/sysusers.d
RUN systemd-sysusers
RUN mkdir -p ${MOD_HOME}

# Install Modcast Configs and Executable
RUN mkdir -p ${MOD_ENV}
COPY ./configs/modcast.json ${MOD_ENV}
COPY ./configs/modcast-twitch-bot ${MOD_BIN}

# Fix permissions and ownership
RUN chown -R root:root ${MOD_ENV}
RUN chmod -R 755 ${MOD_ENV}
RUN chmod -R 644 ${MOD_ENV}/*
RUN chown -R root:root ${MOD_BIN}
RUN chmod -R 755 ${MOD_BIN}

# Expose ports
EXPOSE 4455

# Entrypoint
USER ${USER}
# CMD ["/usr/bin/bash"]
ENTRYPOINT ["modcast-twitch-bot", "-oh", "10.0.0.4"]
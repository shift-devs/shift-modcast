FROM archlinux

# ARGS
ARG USER
ENV USER="twitch"

ARG OBS_HOME
ENV OBS_HOME="/opt/obs"

# Install dependencies
RUN pacman -Syyuu --quiet --noconfirm
RUN pacman -S xorg-server xorg-xinit lightdm lightdm-gtk-greeter x11vnc xf86-video-dummy python obs-studio --quiet --noconfirm

# Create the OBS User
COPY configs/obs.conf /usr/lib/sysusers.d
RUN systemd-sysusers
RUN mkdir -p ${OBS_HOME}

# Install X server configs
COPY configs/10-headless.conf /etc/X11/xorg.conf.d/10-headless.conf
COPY configs/lightdm.conf /etc/lightdm/lightdm.conf

# Install OBS Configs and Profile
COPY ./configs/ShiftStream.json ${OBS_HOME}/.config/obs-studio/basic/scenes/modcast.json
COPY ./modcast-profile ${OBS_HOME}/.config/obs-studio/basic/profiles/modcast

# Fix permissions and ownership
RUN chown -R ${USER}:${USER} ${OBS_HOME}
RUN chmod -R 700 ${OBS_HOME}

# Entrypoint
#USER ${USER}
#RUN Xorg 
#CMD ["/usr/bin/bash"]
#ENTRYPOINT ["x11vnc", "-display", ":0", "-auth", "/var/run/lightdm/root/\:0"]
ENTRYPOINT ["startx"]
